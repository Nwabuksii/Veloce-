import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from "cloudinary";
import { randomUUID } from "crypto";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBuffer(
  buffer: Buffer,
  options: UploadApiOptions
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) return reject(err || new Error("Cloudinary upload failed"));
      resolve(result);
    });
    stream.end(buffer);
  });
}

// ── Private note assets ───────────────────────────────────────────────
// Note PDFs and the un-watermarked page renders are uploaded to Cloudinary as
// type "authenticated": their plain delivery URL returns 403 to anyone who
// doesn't hold a signature, and only this server (which has the API secret)
// can produce one. Nothing in the database is a fetchable URL any more — the
// column stores an internal reference like
//     cld-private:raw:notes/<uuid>.pdf
// that readNoteFile() turns into a signed URL on the server, used for the
// one fetch and never sent to a browser. Every browser-facing byte still goes
// through the watermarked, access-checked API routes.
//
// Rows written before this change still hold a plain https:// URL; those keep
// working (readNoteFile falls back to fetching them as before) until
// scripts/migrate-note-files-to-private.js converts them.

const PRIVATE_PREFIX = "cld-private:";

function privateRefFromUpload(result: UploadApiResponse): string {
  // e.g. https://res.cloudinary.com/<cloud>/raw/authenticated/v1712345/notes/<uuid>.pdf
  const match = result.secure_url?.match(/\/(image|raw)\/authenticated\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)$/);
  if (match) return `${PRIVATE_PREFIX}${match[1]}:${decodeURIComponent(match[2])}`;

  // Defensive fallback if Cloudinary ever changes the URL shape.
  const path = result.resource_type === "image" && result.format ? `${result.public_id}.${result.format}` : result.public_id;
  return `${PRIVATE_PREFIX}${result.resource_type}:${path}`;
}

function signedUrlForPrivateRef(ref: string): string {
  const match = ref.slice(PRIVATE_PREFIX.length).match(/^(image|raw):(.+)$/);
  if (!match) throw new Error("Malformed private storage reference");
  const [, resourceType, path] = match;

  // Images are addressed as public_id + format; raw files use the full
  // path (extension included) as their public_id. Cloudinary signs the two
  // differently, so they're built differently.
  if (resourceType === "image") {
    const dot = path.lastIndexOf(".");
    return cloudinary.url(dot > 0 ? path.slice(0, dot) : path, {
      resource_type: "image",
      type: "authenticated",
      format: dot > 0 ? path.slice(dot + 1) : undefined,
      sign_url: true,
      secure: true,
    });
  }
  return cloudinary.url(path, { resource_type: "raw", type: "authenticated", sign_url: true, secure: true });
}

export async function saveNoteFile(buffer: Buffer, originalName: string): Promise<string> {
  const ext = originalName.split(".").pop() || "pdf";
  const result = await uploadBuffer(buffer, {
    public_id: `notes/${randomUUID()}`,
    resource_type: "raw",
    type: "authenticated",
    format: ext,
  });
  return privateRefFromUpload(result);
}

/** Accepts either a private reference (current) or a legacy public URL. */
export async function readNoteFile(fileRef: string): Promise<Buffer> {
  const url = fileRef.startsWith(PRIVATE_PREFIX) ? signedUrlForPrivateRef(fileRef) : fileRef;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch note file from storage (${res.status}): ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Removes a stored note PDF. Best-effort by design: used to clean up after a
 * failed upload, where a leftover file is harmless but a thrown error here
 * would hide the real failure. Accepts a private reference or a legacy URL.
 */
export async function deleteNoteFile(fileRef: string): Promise<void> {
  try {
    if (fileRef.startsWith(PRIVATE_PREFIX)) {
      const match = fileRef.slice(PRIVATE_PREFIX.length).match(/^(image|raw):(.+)$/);
      if (!match) return;
      const [, resourceType, path] = match;
      // Images are addressed without their extension; raw files include it.
      const dot = path.lastIndexOf(".");
      const publicId = resourceType === "image" && dot > 0 ? path.slice(0, dot) : path;
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType as "image" | "raw", type: "authenticated", invalidate: true });
      return;
    }
    const legacy = fileRef.match(/\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/);
    if (legacy) {
      await cloudinary.uploader.destroy(decodeURIComponent(legacy[2]), { resource_type: legacy[1] as "image" | "raw", type: "upload", invalidate: true });
    }
  } catch (err) {
    console.error("Could not remove orphaned note file:", err instanceof Error ? err.message : "unknown error");
  }
}

export async function saveAvatarImage(
  buffer: Buffer,
  userId: string,
  contentType: string
): Promise<string> {
  const result = await uploadBuffer(buffer, {
    public_id: `avatars/${userId}-${randomUUID()}`,
    resource_type: "image",
    type: "upload",
    access_mode: "public",
  });
  return result.secure_url;
}

export async function saveNotePageImage(
  noteId: string,
  pageNum: number,
  buffer: Buffer
): Promise<string> {
  // Private for the same reason as the PDF: this is the raw, un-watermarked
  // render of the page, and must not be fetchable without going through the
  // watermarking API.
  const result = await uploadBuffer(buffer, {
    public_id: `note-pages/${noteId}/${pageNum}-${randomUUID()}`,
    resource_type: "image",
    format: "jpg",
    type: "authenticated",
  });
  return privateRefFromUpload(result);
}

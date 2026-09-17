import { randomUUID, createHash } from "crypto";

// All files (note PDFs, rendered note-page images, avatars) live on
// Cloudinary now instead of local disk or Vercel Blob — local disk only
// works for local dev / an always-on server; Vercel's serverless functions
// have an ephemeral filesystem that doesn't persist or share across
// invocations, so uploads would randomly vanish once deployed.
//
// Access control still happens at the app layer, not the storage layer:
// /api/notes/[id]/file is the only thing that ever calls readNoteFile, and
// it checks the requester owns, purchased, or administers the note BEFORE
// fetching the bytes. The Cloudinary URL itself is never returned to the
// client directly for notes/pages — only for avatars, which are public by
// nature (see saveAvatarImage).
//
// Requires CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
// env vars (same three values shown on the Cloudinary dashboard). Uses a
// signed upload via plain fetch rather than the `cloudinary` npm package —
// Node's built-in crypto covers the signature; nothing else about the
// upload needs a library.
async function uploadToCloudinary(
  buffer: Buffer,
  publicId: string,
  resourceType: "image" | "raw",
  contentType: string
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("File storage isn't configured yet — missing Cloudinary credentials.");
  }

  const timestamp = Math.floor(Date.now() / 1000);

  // Cloudinary signs every param it receives EXCEPT file/api_key/signature
  // (and cloud_name/resource_type, which aren't sent as form fields at
  // all) — sorted alphabetically as "key=value&key=value", then
  // sha1(that + api_secret).
  // https://cloudinary.com/documentation/authentication_signatures
  const paramsToSign = { public_id: publicId, timestamp: String(timestamp) };
  const toSign = Object.entries(paramsToSign)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signature = createHash("sha1").update(toSign + apiSecret).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }));
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "File upload failed — please try again.");
  }

  return data.secure_url as string;
}

// resource_type "raw" stores the PDF's exact bytes with no Cloudinary-side
// transformation — readNoteFile below re-fetches those bytes for our own
// page-rendering pipeline (lib/pdf-render.ts), so they need to come back
// byte-identical to what was uploaded.
export async function saveNoteFile(buffer: Buffer, originalName: string): Promise<string> {
  const ext = originalName.split(".").pop() || "pdf";
  const publicId = `notes/${randomUUID()}.${ext}`;
  return uploadToCloudinary(buffer, publicId, "raw", "application/pdf");
}

export async function readNoteFile(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch note file from storage (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Profile icons: small, public-by-nature (unlike note files/pages, there's
// no access control to enforce — anyone who can see a person's name can
// see their avatar). Keyed by user id so re-uploading just produces a new
// object; the old one is simply an orphaned file on Cloudinary, same
// tradeoff already made for note pages below.
export async function saveAvatarImage(buffer: Buffer, userId: string, contentType: string): Promise<string> {
  const publicId = `avatars/${userId}-${randomUUID()}`;
  return uploadToCloudinary(buffer, publicId, "image", contentType);
}

// Cached, plain (un-watermarked) render of a single PDF page — see
// lib/pdf-render.ts. One of these gets created the first time ANY viewer
// opens a given page; every viewer after that reuses it as the base image
// the watermark gets stamped onto, instead of re-rendering the PDF.
export async function saveNotePageImage(noteId: string, pageNum: number, buffer: Buffer): Promise<string> {
  const publicId = `note-pages/${noteId}/${pageNum}-${randomUUID()}`;
  return uploadToCloudinary(buffer, publicId, "image", "image/jpeg");
}

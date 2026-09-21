import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";

// Cloudinary initialization
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBuffer(
  buffer: Buffer,
  options: Parameters<typeof cloudinary.uploader.upload_stream>[0]
): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) return reject(err || new Error("Cloudinary upload failed"));
      resolve({ secure_url: result.secure_url, public_id: result.public_id });
    });
    stream.end(buffer);
  });
}

export async function saveNoteFile(buffer: Buffer, originalName: string): Promise<string> {
  const result = await uploadBuffer(buffer, {
    public_id: `notes/${randomUUID()}`,
    resource_type: "raw",
    type: "upload",
    access_mode: "public", // Ensures server-side fetch can retrieve raw PDF bytes
  });
  return result.secure_url;
}

export async function readNoteFile(fileUrl: string): Promise<Buffer> {
  // Use user-agent header to avoid CDN edge blocking on serverless node fetches
  const res = await fetch(fileUrl, {
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
  const result = await uploadBuffer(buffer, {
    public_id: `note-pages/${noteId}/${pageNum}-${randomUUID()}`,
    resource_type: "image",
    format: "jpg",
    type: "upload",
    access_mode: "public",
  });
  return result.secure_url;
}

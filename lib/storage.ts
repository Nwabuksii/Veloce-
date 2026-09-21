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

export async function saveNoteFile(buffer: Buffer, originalName: string): Promise<string> {
  const ext = originalName.split(".").pop() || "pdf";
  const result = await uploadBuffer(buffer, {
    public_id: `notes/${randomUUID()}`,
    resource_type: "raw",
    type: "upload",
    access_mode: "public",
    format: ext,
  });
  return result.secure_url;
}

export async function readNoteFile(fileUrl: string): Promise<Buffer> {
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

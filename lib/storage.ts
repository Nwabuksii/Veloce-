import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";

// Files live in Cloudinary now instead of Vercel Blob — same reasoning as
// before still applies: Vercel's serverless functions have an ephemeral
// filesystem, so uploads need to live somewhere durable off-disk.
//
// Access control still happens at the app layer, not the storage layer:
// /api/notes/[id]/file is the only thing that ever calls readNoteFile, and
// it checks the requester owns, purchased, or administers the note BEFORE
// fetching the bytes. The Cloudinary URL itself is never returned to the client.

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBuffer(
  buffer: Buffer,
  options: Parameters<typeof cloudinary.uploader.upload_stream>[0]
): Promise<{ secure_url: string }> {
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
    resource_type: "raw", // PDFs aren't images — Cloudinary needs "raw" for those
    format: ext,
  });
  return result.secure_url;
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
// see their avatar), so the Cloudinary URL is stored directly on
// User.avatarUrl and used as-is.
export async function saveAvatarImage(buffer: Buffer, userId: string, contentType: string): Promise<string> {
  const result = await uploadBuffer(buffer, {
    public_id: `avatars/${userId}-${randomUUID()}`,
    resource_type: "image",
  });
  return result.secure_url;
}

// Cached, plain (un-watermarked) render of a single PDF page — see
// lib/pdf-render.ts. One of these gets created the first time ANY viewer
// opens a given page; every viewer after that reuses it as the base image
// the watermark gets stamped onto, instead of re-rendering the PDF.
export async function saveNotePageImage(noteId: string, pageNum: number, buffer: Buffer): Promise<string> {
  const result = await uploadBuffer(buffer, {
    public_id: `note-pages/${noteId}/${pageNum}-${randomUUID()}`,
    resource_type: "image",
  });
  return result.secure_url;
}

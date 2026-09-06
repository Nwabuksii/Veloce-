import { put } from "@vercel/blob";
import { randomUUID } from "crypto";

// Files are stored in Vercel Blob instead of local disk — local disk only
// works for local dev / an always-on server; Vercel's serverless functions
// have an ephemeral filesystem that doesn't persist or share across
// invocations, so uploads would randomly vanish once deployed.
//
// Access control still happens at the app layer, not the storage layer:
// /api/notes/[id]/file is the only thing that ever calls readNoteFile, and
// it checks the requester owns, purchased, or administers the note BEFORE
// fetching the bytes. The blob URL itself is never returned to the client.

export async function saveNoteFile(buffer: Buffer, originalName: string): Promise<string> {
  const ext = originalName.split(".").pop() || "pdf";
  const key = `notes/${randomUUID()}.${ext}`;

  const blob = await put(key, buffer, {
    access: "public", // required by Vercel Blob's API shape — real gating happens above, not here
    contentType: "application/pdf",
  });

  return blob.url; // this full URL is what gets stored on the Note row now
}

export async function readNoteFile(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch note file from storage (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Cached, plain (un-watermarked) render of a single PDF page — see
// lib/pdf-render.ts. One of these gets created the first time ANY viewer
// opens a given page; every viewer after that reuses it as the base image
// the watermark gets stamped onto, instead of re-rendering the PDF.
export async function saveNotePageImage(noteId: string, pageNum: number, buffer: Buffer): Promise<string> {
  const key = `note-pages/${noteId}/${pageNum}-${randomUUID()}.jpg`;

  const blob = await put(key, buffer, {
    access: "public", // same rationale as saveNoteFile — real gating happens at the API route, not here
    contentType: "image/jpeg",
  });

  return blob.url;
}

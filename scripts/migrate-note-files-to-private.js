// One-off: moves every EXISTING note PDF and cached page image from public
// Cloudinary storage to private ("authenticated") storage, and rewrites the
// database column to the internal reference format lib/storage.ts now uses.
//
// Why it's needed: new uploads are private from the moment this release is
// deployed, but everything uploaded before that is still reachable by anyone
// who has (or guesses/leaks) its plain public URL — the watermarked API is
// only a facade while the raw file is public. This closes that for old files.
//
// Order of operations:
//   1. Deploy the release first (it reads BOTH formats, so nothing breaks).
//   2. Run this script — dry run by default, then with --commit.
//
// Per file, it: downloads the public copy -> uploads it as private ->
// verifies the private copy is readable and the same size -> ONLY THEN
// switches the database row -> and finally deletes the old public copy.
// A failure at any step leaves the row pointing at the still-working old
// file, so it is safe to re-run; already-converted rows are skipped.
//
// Usage:
//   node scripts/migrate-note-files-to-private.js            (dry run)
//   node scripts/migrate-note-files-to-private.js --commit   (do it)
//
// Needs DATABASE_URL and the three CLOUDINARY_* env vars, like the app.

const { PrismaClient } = require("@prisma/client");
const { v2: cloudinary } = require("cloudinary");
const { randomUUID } = require("crypto");

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const PRIVATE_PREFIX = "cld-private:";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) return reject(err || new Error("Cloudinary upload failed"));
      resolve(result);
    });
    stream.end(buffer);
  });
}

// Mirrors privateRefFromUpload / signedUrlForPrivateRef in lib/storage.ts.
function refFromUpload(result) {
  const match = result.secure_url?.match(/\/(image|raw)\/authenticated\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)$/);
  if (match) return `${PRIVATE_PREFIX}${match[1]}:${decodeURIComponent(match[2])}`;
  const path = result.resource_type === "image" && result.format ? `${result.public_id}.${result.format}` : result.public_id;
  return `${PRIVATE_PREFIX}${result.resource_type}:${path}`;
}

function signedUrl(ref) {
  const [, resourceType, path] = ref.slice(PRIVATE_PREFIX.length).match(/^(image|raw):(.+)$/);
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

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Works out what to call Cloudinary's destroy() with, from an old public URL.
function parsePublicUrl(url) {
  const m = url.match(/\/(image|raw)\/upload\/(?:v\d+\/)?(.+)$/);
  if (!m) return null;
  const resourceType = m[1];
  let publicId = decodeURIComponent(m[2]);
  if (resourceType === "image") publicId = publicId.replace(/\.[a-z0-9]+$/i, ""); // images: public_id has no extension
  return { resourceType, publicId };
}

async function convert(kind, row, oldUrl) {
  const parsed = parsePublicUrl(oldUrl);
  if (!parsed) throw new Error(`Not a Cloudinary public URL: ${oldUrl}`);

  const original = await fetchBuffer(oldUrl);

  const uploadOptions =
    kind === "note-pdf"
      ? { public_id: `notes/${randomUUID()}`, resource_type: "raw", type: "authenticated", format: "pdf" }
      : { public_id: `note-pages/${row.noteId}/${row.pageNum}-${randomUUID()}`, resource_type: "image", format: "jpg", type: "authenticated" };

  const result = await uploadBuffer(original, uploadOptions);
  const ref = refFromUpload(result);

  // Don't switch anything until the private copy is proven readable.
  const check = await fetchBuffer(signedUrl(ref));
  if (check.length !== original.length) {
    throw new Error(`Size mismatch after re-upload (${check.length} vs ${original.length}) — leaving row untouched`);
  }

  return { ref, parsed };
}

async function main() {
  console.log(COMMIT ? "COMMIT mode — converting files." : "DRY RUN — nothing will be changed. Re-run with --commit.");

  const notes = await prisma.note.findMany({ where: { fileUrl: { startsWith: "http" } }, select: { id: true, fileUrl: true } });
  const pages = await prisma.notePageImage.findMany({ where: { imageUrl: { startsWith: "http" } }, select: { id: true, noteId: true, pageNum: true, imageUrl: true } });

  console.log(`Note PDFs still public: ${notes.length}`);
  console.log(`Page images still public: ${pages.length}`);
  if (!COMMIT) return;

  let ok = 0;
  let failed = 0;

  for (const n of notes) {
    try {
      const { ref, parsed } = await convert("note-pdf", n, n.fileUrl);
      await prisma.note.update({ where: { id: n.id }, data: { fileUrl: ref } });
      await cloudinary.uploader.destroy(parsed.publicId, { resource_type: parsed.resourceType, type: "upload", invalidate: true }).catch((e) =>
        console.error(`  (old public copy of note ${n.id} not deleted: ${e.message})`)
      );
      ok++;
    } catch (err) {
      failed++;
      console.error(`FAILED note ${n.id}:`, err.message);
    }
  }

  for (const p of pages) {
    try {
      const { ref, parsed } = await convert("page-image", p, p.imageUrl);
      await prisma.notePageImage.update({ where: { id: p.id }, data: { imageUrl: ref } });
      await cloudinary.uploader.destroy(parsed.publicId, { resource_type: parsed.resourceType, type: "upload", invalidate: true }).catch((e) =>
        console.error(`  (old public copy of page ${p.id} not deleted: ${e.message})`)
      );
      ok++;
    } catch (err) {
      failed++;
      console.error(`FAILED page image ${p.id}:`, err.message);
    }
  }

  console.log(`Done. Converted: ${ok}, failed: ${failed}${failed ? " — safe to re-run to retry the failures." : ""}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

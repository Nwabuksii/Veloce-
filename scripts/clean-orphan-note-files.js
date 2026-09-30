// Finds note PDFs in Cloudinary that no Note row points to (left behind by
// uploads that failed before the fix in Phase 7) and deletes them.
//
//   node scripts/clean-orphan-note-files.js            dry run — lists only
//   node scripts/clean-orphan-note-files.js --commit   actually deletes
//
// Only looks at the `notes/` folder, and never touches a file younger than
// an hour (it may belong to an upload that is still in progress).
const { PrismaClient } = require("@prisma/client");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const commit = process.argv.includes("--commit");
const MIN_AGE_MS = 60 * 60 * 1000;
const prisma = new PrismaClient();

async function listAll(type) {
  const found = [];
  let cursor;
  do {
    const res = await cloudinary.api.resources({ resource_type: "raw", type, prefix: "notes/", max_results: 500, next_cursor: cursor });
    found.push(...res.resources.map((r) => ({ ...r, type })));
    cursor = res.next_cursor;
  } while (cursor);
  return found;
}

(async () => {
  const notes = await prisma.note.findMany({ select: { fileUrl: true } });
  const refs = notes.map((n) => n.fileUrl);
  const referenced = (publicId) => refs.some((ref) => ref.includes(publicId));

  const resources = [...(await listAll("authenticated")), ...(await listAll("upload"))];
  const orphans = resources.filter(
    (r) => Date.now() - new Date(r.created_at).getTime() > MIN_AGE_MS && !referenced(r.public_id)
  );

  console.log(`${resources.length} stored note file(s), ${orphans.length} not referenced by any note.`);
  for (const o of orphans) console.log(`${commit ? "deleting" : "would delete"}: ${o.type}/${o.public_id} (${o.bytes} bytes, ${o.created_at})`);

  if (commit) {
    for (const o of orphans) {
      await cloudinary.uploader.destroy(o.public_id, { resource_type: "raw", type: o.type, invalidate: true });
    }
    console.log("Done.");
  } else if (orphans.length > 0) {
    console.log("Dry run only. Re-run with --commit to delete them.");
  }
  await prisma.$disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

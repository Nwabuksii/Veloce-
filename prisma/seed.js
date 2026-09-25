// Seed script intentionally does not create any sample blocks.
// This is a no-op so local/dev databases remain empty unless content is added
// intentionally through the app or a dedicated, explicit data script.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Seed script disabled: no sample blocks or demo content are created.");
  console.log("Database left untouched. Use the app or a dedicated data script to add real content.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());


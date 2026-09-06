// Seeds one course with the four sample blocks under Babcock,
// so the dashboard has real data to display.
// Run with: node prisma/seed.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const university = await prisma.university.upsert({
    where: { slug: "babcock" },
    update: {},
    create: { name: "Babcock University", slug: "babcock" },
  });

  const department = await prisma.department.upsert({
    where: { universityId_name: { universityId: university.id, name: "Computer Science" } },
    update: {},
    create: { name: "Computer Science", universityId: university.id },
  });

  const course = await prisma.course.upsert({
    where: { departmentId_code: { departmentId: department.id, code: "COS 201" } },
    update: {},
    create: { name: "Intro to Programming", code: "COS 201", departmentId: department.id },
  });

  // Placeholder scribe so seeded blocks have something purchasable.
  // Real scribe uploads (Phase 4) replace this once that flow is built.
  const placeholderScribe = await prisma.user.upsert({
    where: { email: "seed-scribe@babcock.edu.ng" },
    update: {},
    create: {
      email: "seed-scribe@babcock.edu.ng",
      passwordHash: "not-a-real-login", // this account isn't meant to log in
      fullName: "Sample Scribe",
      role: "SCRIBE",
      universityId: university.id,
    },
  });

  const blocks = [
    { title: "Block 1: Foundations", order: 1 },
    { title: "Block 2: CA Prep", order: 2 },
    { title: "Block 3: Exam Prep", order: 3 },
    { title: "Block 4: Advanced", order: 4 },
  ];

  for (const b of blocks) {
    const block = await prisma.block.upsert({
      where: { courseId_order: { courseId: course.id, order: b.order } },
      update: {},
      create: { title: b.title, order: b.order, price: 1000, courseId: course.id },
    });

    const existingNote = await prisma.note.findFirst({ where: { blockId: block.id } });
    if (!existingNote) {
      await prisma.note.create({
        data: {
          blockId: block.id,
          scribeId: placeholderScribe.id,
          fileUrl: "https://example.com/placeholder-notes.pdf",
          status: "LIVE",
        },
      });
    }
  }

  console.log("Seed complete: Babcock / Computer Science / COS 201 with 4 purchasable blocks.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

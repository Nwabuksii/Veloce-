// Run this ONCE after deploying the email-verification feature, so nobody
// who signed up before this change gets locked out under the new "strict"
// rule (unverified email = can't log in at all).
//
// Usage:  node scripts/grandfather-existing-users.js
//
// Safe to run more than once — it only ever touches rows that are still
// unverified, so it's a no-op for anyone already verified.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  console.log(`Grandfathered ${result.count} existing user(s) as email-verified.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

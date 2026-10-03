// TESTING-PHASE tool: "deletes" a user but keeps every record they made.
//
// The person is removed (name, email, photo, bank details, password, two-factor,
// sign-in sessions). Their purchases, reviews, feedback, votes, follows and
// messages stay exactly where they are, now attributed to "Deleted user", so
// every count, scribe earning and ledger total stays correct. (The database
// itself refuses to hard-delete a user who has purchases, and Prisma Studio
// will keep refusing — that protection is intentional.)
//
// Safety:
//   - does nothing unless ALLOW_USER_DELETE=true is set; remove that setting
//     when you launch and this tool stops working
//   - dry run by default; add --commit to do it
//   - refuses admin accounts and accounts already deleted
//   - nothing can be undone, because the name, email and password are overwritten
//
//   ALLOW_USER_DELETE=true node scripts/delete-user.js student@example.com
//   ALLOW_USER_DELETE=true node scripts/delete-user.js student@example.com --commit

const { PrismaClient } = require("@prisma/client");
const { randomBytes } = require("crypto");

const DELETED_DOMAIN = "deleted.invalid";
const BCRYPT_CHARS = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Shaped like a bcrypt hash but made from random characters, so no password
// can ever match it.
function unusablePasswordHash() {
  const bytes = randomBytes(53);
  let out = "$2a$12$";
  for (const b of bytes) out += BCRYPT_CHARS[b % BCRYPT_CHARS.length];
  return out;
}

async function main() {
  if (process.env.ALLOW_USER_DELETE !== "true") {
    console.error("Disabled. Set ALLOW_USER_DELETE=true to use this testing tool.");
    process.exit(1);
  }
  const email = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!email || email.startsWith("--")) {
    console.error("Usage: ALLOW_USER_DELETE=true node scripts/delete-user.js <email> [--commit]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        _count: { select: { purchases: true, notes: true, reviews: true, feedback: true, followers: true, following: true } },
      },
    });
    if (!user) {
      console.error("No user with that email.");
      process.exit(1);
    }
    if (user.role === "ADMIN") {
      console.error("Refusing to delete an admin account.");
      process.exit(1);
    }
    if (user.role === "DELETED" || user.email.endsWith(`@${DELETED_DOMAIN}`)) {
      console.error("That account is already deleted.");
      process.exit(1);
    }

    const c = user._count;
    console.log(`${user.fullName} <${user.email}> (${user.role})`);
    console.log(`Records that STAY: ${c.purchases} purchases, ${c.notes} notes, ${c.reviews} reviews, ${c.feedback} feedback, ${c.following} follows, ${c.followers} followers.`);
    console.log("Removed: name, email, photo, bank details, password, two-factor, sign-in. Role becomes DELETED. Pending scribe application (if any) is rejected.");
    if (!commit) {
      console.log("Dry run. Re-run with --commit to delete this person.");
      return;
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.pendingRegistration.deleteMany({ where: { email: user.email } }),
      prisma.scribeApplication.updateMany({
        where: { userId: user.id, status: "PENDING" },
        data: { status: "REJECTED", reviewedAt: now },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          // email and fullNameNormalized are unique, so each needs a value that is unique to this user.
          email: `deleted-${user.id}@${DELETED_DOMAIN}`,
          role: "DELETED", // out of the student/scribe lists
          fullName: "Deleted user",
          fullNameNormalized: `deleted-user-${user.id}`,
          passwordHash: unusablePasswordHash(),
          avatarUrl: null,
          avatarDisplay: "default",
          bankCode: null,
          bankName: null,
          accountNumber: null,
          accountName: null,
          payoutRecipientCode: null,
          mfaSecret: null,
          mfaEnabledAt: null,
          mfaLastStep: null,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          bannedAt: now,
          banReason: "Account deleted",
          banExpiresAt: null,
          sessionVersion: { increment: 1 }, // signs out every open session
        },
      }),
    ]);
    // Same JSON shape lib/security-log.ts writes.
    console.log(JSON.stringify({ type: "security", event: "user_deleted", severity: "alert", userId: user.id, via: "script", ts: now.toISOString() }));
    console.log(`Done. ${user.email} is now "Deleted user"; all their records are untouched. The email can be used to sign up again.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Break-glass: turns two-factor login OFF for one account, for an admin who
// lost both their authenticator and their recovery codes (or after rotating
// JWT_SECRET without MFA_ENCRYPTION_KEY, which makes stored secrets
// unreadable). Run by someone with database access — there is deliberately
// no in-app way to do this.
//
//   node scripts/reset-admin-mfa.js admin@example.com           (dry run)
//   node scripts/reset-admin-mfa.js admin@example.com --commit
//
// The account can log in with just its password afterwards and should
// re-enroll from Settings straight away. Also signs out all its sessions.

const { PrismaClient } = require("@prisma/client");

async function main() {
  const email = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!email || email.startsWith("--")) {
    console.error("Usage: node scripts/reset-admin-mfa.js <email> [--commit]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, role: true, mfaEnabledAt: true },
    });
    if (!user) {
      console.error("No user with that email.");
      process.exit(1);
    }
    console.log(`${user.email} (${user.role}) — two-factor is ${user.mfaEnabledAt ? "ON" : "already off"}`);
    if (!commit) {
      console.log("Dry run. Re-run with --commit to turn it off.");
      return;
    }

    await prisma.$transaction([
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null, sessionVersion: { increment: 1 } },
      }),
    ]);
    // Same JSON shape lib/security-log.ts writes, so it shows up in the same searches.
    console.log(JSON.stringify({ type: "security", event: "mfa_disabled", severity: "alert", userId: user.id, via: "script", ts: new Date().toISOString() }));
    console.log("Done. Two-factor is off and all sessions for this account are signed out.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

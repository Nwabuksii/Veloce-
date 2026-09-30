import { prisma } from "@/lib/prisma";
import { decryptSecret, hashRecoveryCode, looksLikeRecoveryCode, verifyTotp } from "@/lib/mfa";

// Checks (and spends) a code typed by someone with two-factor on: either the
// current 6-digit authenticator code or one of their recovery codes. Shared
// by the login second step and by "turn two-factor off", so both apply the
// same replay protection.

export interface MfaCheckResult {
  ok: boolean;
  usedRecoveryCode: boolean;
}

export async function consumeMfaCode(
  user: { id: string; mfaSecret: string | null; mfaLastStep: number | null },
  code: string
): Promise<MfaCheckResult> {
  if (!user.mfaSecret) return { ok: false, usedRecoveryCode: false };

  if (looksLikeRecoveryCode(code)) {
    // One conditional update spends the code: only one of two simultaneous
    // requests using the same code can match `usedAt: null`.
    const spent = await prisma.mfaRecoveryCode.updateMany({
      where: { userId: user.id, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return { ok: spent.count === 1, usedRecoveryCode: spent.count === 1 };
  }

  let step: number | null = null;
  try {
    step = verifyTotp(decryptSecret(user.mfaSecret), code, { lastUsedStep: user.mfaLastStep });
  } catch (err) {
    // The stored secret can't be decrypted (e.g. JWT_SECRET was rotated).
    console.error("MFA check: could not decrypt stored secret for user", user.id, err);
  }
  if (step === null) return { ok: false, usedRecoveryCode: false };

  // Remember the step in the same statement that checks it hasn't been used,
  // so the same code can't be accepted twice even in parallel requests.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step },
  });
  return { ok: claimed.count === 1, usedRecoveryCode: false };
}

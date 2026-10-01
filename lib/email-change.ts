import { createHash, randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";

// Changing an account email is a take-over risk (the new address receives
// every future password reset), so it takes two emails:
//   - the NEW address gets a link that must be clicked to finish the change;
//   - the OLD address gets a "this wasn't me" link that cancels a pending
//     change — or, if the change already went through, puts the old email
//     back — and signs every device out.
// Only SHA-256 hashes of the tokens are stored, like password resets.

export const CONFIRM_TTL_MS = 60 * 60 * 1000; // the new address has 1 hour to click
export const REVERT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // the old address can undo for 7 days

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendConfirmToNewAddress(params: { to: string; fullName: string; confirmToken: string }) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/confirm-email-change?token=${params.confirmToken}`;
  await sendEmail({
    to: params.to,
    subject: "Confirm your new Veloce email",
    text: `Hi ${params.fullName},\n\nYou asked to use this address for your Veloce account. Confirm it here:\n${url}\n\nThis link expires in 1 hour. Until you click it, nothing changes. If this wasn't you, ignore this email.`,
    html: `<p>Hi ${escapeHtml(params.fullName)},</p><p>You asked to use this address for your Veloce account.</p><p><a href="${url}">Click here to confirm your new email</a>.</p><p>This link expires in 1 hour. Until you click it, nothing changes. If this wasn't you, ignore this email.</p>`,
  });
}

export async function sendAlertToOldAddress(params: { to: string; fullName: string; newEmail: string; revertToken: string }) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/email-change-not-me?token=${params.revertToken}`;
  await sendEmail({
    to: params.to,
    subject: "Veloce: someone asked to change your account email",
    text: `Hi ${params.fullName},\n\nA request was made to change the email on your Veloce account to ${params.newEmail}. It only takes effect if that address confirms it.\n\nIf this was you, you don't need to do anything.\n\nIf this ISN'T you, click here right away:\n${url}\n\nThat cancels the change (or puts this email back if it already went through) and signs every device out. Then reset your password. The link works for 7 days.`,
    html: `<p>Hi ${escapeHtml(params.fullName)},</p><p>A request was made to change the email on your Veloce account to <strong>${escapeHtml(params.newEmail)}</strong>. It only takes effect if that address confirms it.</p><p>If this was you, you don't need to do anything.</p><p><strong>If this isn't you, <a href="${url}">click here right away</a>.</strong> That cancels the change (or puts this email back if it already went through) and signs every device out. Then reset your password. The link works for 7 days.</p>`,
  });
}

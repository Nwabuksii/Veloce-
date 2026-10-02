import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { REFUND_WINDOW_MINUTES } from "@/lib/pricing";
import { REFUND_LOCATION, REFUND_NOTICE_DEADLINE, refundUrl } from "@/lib/refund-notice";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// "You bought X — here is how to get a refund, and by when." Best effort: a
// failed email must never fail or slow a purchase, so errors are logged and
// swallowed, and the send gives up after 4 seconds.
export async function sendRefundWindowEmail(purchaseId: string): Promise<void> {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: { id: true, purchasedAt: true, buyer: { select: { email: true, fullName: true } }, block: { select: { title: true } } },
    });
    if (!purchase) return;

    const deadline = new Date(purchase.purchasedAt.getTime() + REFUND_WINDOW_MINUTES * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const url = refundUrl(purchase.id);
    const title = purchase.block.title;

    const text = [
      `Hi ${purchase.buyer.fullName},`,
      ``,
      `You unlocked "${title}" on Veloce.`,
      ``,
      `Not what you expected? You can request a refund within ${REFUND_WINDOW_MINUTES} minutes of buying (until about ${deadline}).`,
      `Where: ${REFUND_LOCATION}`,
      `Direct link: ${url}`,
      ``,
      REFUND_NOTICE_DEADLINE,
    ].join("\n");

    const html = `<p>Hi ${esc(purchase.buyer.fullName)},</p>
<p>You unlocked <strong>${esc(title)}</strong> on Veloce.</p>
<p>Not what you expected? You can request a refund within <strong>${REFUND_WINDOW_MINUTES} minutes</strong> of buying (until about ${deadline}).</p>
<p>Where to find it: <strong>${esc(REFUND_LOCATION)}</strong>, or <a href="${url}">go straight to it</a>.</p>
<p>${esc(REFUND_NOTICE_DEADLINE)}</p>`;

    await Promise.race([
      sendEmail({ to: purchase.buyer.email, subject: `You bought "${title}" — refund window: ${REFUND_WINDOW_MINUTES} minutes`, text, html }),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch (err) {
    console.error("Failed to send refund-window email:", err);
  }
}

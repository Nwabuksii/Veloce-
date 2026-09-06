import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

// Register this URL (https://your-domain/api/webhooks/paystack) on the
// Paystack Dashboard under Settings -> API Keys & Webhooks. Paystack signs
// every webhook body with your secret key so we can trust it actually came
// from them and wasn't forged — we verify that BEFORE trusting anything in
// the payload, same principle as never trusting a client-supplied amount.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const expectedSignature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "")
    .update(rawBody)
    .digest("hex");

  if (!signature || signature !== expectedSignature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const reference: string | undefined = event?.data?.reference;

  if (!reference) {
    return NextResponse.json({ received: true }); // not a transfer event we care about
  }

  const payout = await prisma.payout.findUnique({ where: { paystackTransferRef: reference } });
  if (!payout) {
    return NextResponse.json({ received: true }); // reference doesn't match any payout — nothing to do
  }

  if (event.event === "transfer.success") {
    await prisma.payout.update({ where: { id: payout.id }, data: { status: "PAID", paidAt: new Date() } });
  } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: "FAILED", failureReason: event?.data?.failure_reason || event.event },
    });
  }

  return NextResponse.json({ received: true });
}

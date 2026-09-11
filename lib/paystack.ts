const PAYSTACK_BASE = "https://api.paystack.co";

interface InitializeParams {
  email: string;
  amount: number; // Naira — converted to kobo internally
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface VerifyResult {
  status: "success" | "failed" | "abandoned";
  amount: number; // kobo
  reference: string;
  metadata: Record<string, unknown>;
}

export async function initializeTransaction(params: InitializeParams): Promise<InitializeResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: Math.round(params.amount * 100), // Naira -> kobo
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Paystack initialize failed");
  return data.data;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Paystack verify failed");
  return data.data;
}

// ─────────────────────────────────────────────
// Payouts — scribes withdrawing their earnings
// ─────────────────────────────────────────────

export interface Bank {
  name: string;
  code: string;
}

export async function listBanks(): Promise<Bank[]> {
  const res = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Paystack bank list failed");
  return data.data.map((b: any) => ({ name: b.name, code: b.code }));
}

// Resolves an account number to the real name on the account — always call
// this before saving anyone's bank details, so a typo'd digit surfaces as
// "not what I expected" before any money is ever at stake, not after.
export async function resolveAccountNumber(accountNumber: string, bankCode: string): Promise<string> {
  const res = await fetch(
    `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Couldn't verify that account number");
  return data.data.account_name;
}

// One-time per scribe — Paystack needs a "recipient" object before it'll
// send money anywhere. The resulting recipient_code gets cached on the
// User row so this only ever runs once per person, not once per payout.
export async function createTransferRecipient(params: {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}): Promise<string> {
  const res = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: params.accountName,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: "NGN",
    }),
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Couldn't register that bank account with Paystack");
  return data.data.recipient_code;
}

interface InitiateTransferResult {
  transfer_code: string;
  reference: string;
  status: string; // "pending" | "success" | "otp" | ...
}

// Requires "Confirm transfers before sending" to be OFF in the Paystack
// dashboard (Settings -> Preferences -> Transfer Approval) — otherwise
// every transfer comes back requiring an OTP typed in by a human, which
// defeats the point of this being automated.
export async function initiateTransfer(params: {
  amount: number; // Naira
  recipientCode: string;
  reference: string;
  reason: string;
}): Promise<InitiateTransferResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(params.amount * 100), // Naira -> kobo
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
    }),
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Paystack transfer failed to initiate");
  return data.data;
}

export async function verifyTransfer(reference: string): Promise<{ status: string; failureReason?: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/transfer/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Paystack transfer verify failed");
  return { status: data.data.status, failureReason: data.data.failure_reason };
}

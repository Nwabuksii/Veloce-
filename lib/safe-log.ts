// What is safe to send to logs and Sentry. A payment webhook payload holds
// the customer's email, card details (last4, bank, authorization codes) and
// more — none of which belongs in an error tracker.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A payload reduced to non-sensitive diagnostics: a few known scalar fields
 * plus the *names* of the keys present (enough to see when Paystack's shape
 * differs from what we expect, without any of the values).
 */
export function safePaymentSummary(data: unknown) {
  if (!isObject(data)) return { shape: typeof data };
  const transaction = isObject(data.transaction) ? data.transaction : undefined;
  const pick = (source: Json | undefined, key: string) =>
    typeof source?.[key] === "string" || typeof source?.[key] === "number" ? source[key] : undefined;

  return {
    reference: pick(data, "reference") ?? pick(transaction, "reference") ?? pick(data, "transaction_reference"),
    status: pick(data, "status"),
    amount: pick(data, "amount"),
    currency: pick(data, "currency"),
    keys: Object.keys(data).sort(),
    transactionKeys: transaction ? Object.keys(transaction).sort() : undefined,
  };
}

const SENSITIVE_HEADERS = ["cookie", "authorization", "x-paystack-signature", "x-forwarded-for", "x-real-ip"];

/**
 * Sentry beforeSend hook: drops the request body, cookies and credential
 * headers from every event, whatever the SDK's defaults attach.
 */
export function scrubSentryEvent<T extends { request?: any }>(event: T): T {
  const request = event.request;
  if (!request) return event;

  delete request.data;
  delete request.cookies;
  if (isObject(request.headers)) {
    for (const name of Object.keys(request.headers)) {
      if (SENSITIVE_HEADERS.includes(name.toLowerCase())) delete request.headers[name];
    }
  }
  return event;
}

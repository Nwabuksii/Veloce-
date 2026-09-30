import { describe, expect, it } from "vitest";
import { safePaymentSummary, scrubSentryEvent } from "./safe-log";

describe("safePaymentSummary", () => {
  const payload = {
    reference: "veloce_abc",
    status: "success",
    amount: 100000,
    currency: "NGN",
    customer: { email: "buyer@example.com" },
    authorization: { last4: "4081", bank: "TEST BANK" },
  };

  it("keeps only safe scalar fields and key names", () => {
    const summary = safePaymentSummary(payload);
    expect(summary.reference).toBe("veloce_abc");
    expect(summary.amount).toBe(100000);
    const text = JSON.stringify(summary);
    expect(text.includes("buyer@example.com")).toBe(false);
    expect(text.includes("4081")).toBe(false);
    expect(text.includes("TEST BANK")).toBe(false);
  });

  it("finds a nested transaction reference", () => {
    expect(safePaymentSummary({ transaction: { reference: "r1", id: 5 } }).reference).toBe("r1");
  });

  it("copes with a non-object payload", () => {
    expect(safePaymentSummary(null)).toEqual({ shape: "object" });
    expect(safePaymentSummary("x")).toEqual({ shape: "string" });
  });
});

describe("scrubSentryEvent", () => {
  it("removes the body, cookies and credential headers but keeps the rest", () => {
    const event = scrubSentryEvent({
      message: "boom",
      request: {
        url: "/api/x",
        data: { password: "hunter2" },
        cookies: { veloce_session: "jwt" },
        headers: { Cookie: "a=b", Authorization: "Bearer t", "x-paystack-signature": "s", "user-agent": "ua" },
      },
    });
    expect(event.request.data === undefined).toBe(true);
    expect(event.request.cookies === undefined).toBe(true);
    expect(event.request.headers).toEqual({ "user-agent": "ua" });
    expect(event.request.url).toBe("/api/x");
  });

  it("leaves events with no request alone", () => {
    expect(scrubSentryEvent({ message: "x" })).toEqual({ message: "x" });
  });
});

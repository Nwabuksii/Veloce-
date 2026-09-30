import { describe, expect, it } from "vitest";
import { outcomeFromPaystackStatus, settlementTarget } from "./payout-settlement";

describe("outcomeFromPaystackStatus", () => {
  it("maps final statuses and ignores in-flight ones", () => {
    expect(outcomeFromPaystackStatus("success")).toBe("success");
    expect(outcomeFromPaystackStatus("failed")).toBe("failed");
    expect(outcomeFromPaystackStatus("reversed")).toBe("reversed");
    for (const s of ["pending", "processing", "received", "otp", undefined]) {
      expect(outcomeFromPaystackStatus(s)).toBeNull();
    }
  });
});

describe("settlementTarget", () => {
  it("settles a processing payout", () => {
    expect(settlementTarget("PROCESSING", "success")).toBe("PAID");
    expect(settlementTarget("PROCESSING", "failed")).toBe("FAILED");
    expect(settlementTarget("PROCESSING", "reversed")).toBe("FAILED");
  });
  it("ignores a replayed success", () => {
    expect(settlementTarget("PAID", "success")).toBeNull();
  });
  it("never lets a late failure overwrite a paid payout", () => {
    expect(settlementTarget("PAID", "failed")).toBeNull();
  });
  it("lets a reversal undo a paid payout", () => {
    expect(settlementTarget("PAID", "reversed")).toBe("FAILED");
  });
  it("ignores anything for payouts not yet sent or already failed", () => {
    expect(settlementTarget("PENDING", "success")).toBeNull();
    expect(settlementTarget("FAILED", "success")).toBeNull();
    expect(settlementTarget("FAILED", "failed")).toBeNull();
  });
});

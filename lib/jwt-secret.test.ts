import { describe, expect, it } from "vitest";
import { jwtSecretProblem } from "./jwt-secret";

describe("jwtSecretProblem", () => {
  it("rejects a missing secret", () => {
    expect(jwtSecretProblem(undefined)).toMatch(/not set/);
    expect(jwtSecretProblem("")).toMatch(/not set/);
  });
  it("rejects a short secret", () => {
    expect(jwtSecretProblem("a1b2c3d4e5f6")).toMatch(/too short/);
  });
  it("rejects placeholder values even when long enough", () => {
    expect(jwtSecretProblem("your-super-secret-jwt-key-change-me-please")).toMatch(/placeholder/);
    expect(jwtSecretProblem("Password1234567890Password1234567890")).toMatch(/placeholder/);
  });
  it("rejects a secret with almost no variety", () => {
    expect(jwtSecretProblem("a".repeat(48))).toMatch(/variety/);
    expect(jwtSecretProblem("abababababababababababababababababab")).toMatch(/variety/);
  });
  it("accepts a random 64-char hex secret and a base64 secret", () => {
    expect(jwtSecretProblem("3f9c1b7ad25e48f0c6a1d9e7b2f4a8c05d3e6b1f9a7c2d4e8b0f1a3c5d7e9b2f")).toBeNull();
    expect(jwtSecretProblem("q8Zr2Vn0T5xLw1YbKc7HdJ3mPfGs9UeAo4iNhBt6RlE=")).toBeNull();
  });
});

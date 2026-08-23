import { describe, expect, it } from "vitest";
import { statusForToken } from "../../src/auth/token.js";

describe("token expiry", () => {
  it("rejects a token exactly at its expiration boundary", () => {
    const boundary = Date.UTC(2026, 7, 23, 18, 0, 0);
    expect(statusForToken(boundary, boundary)).toBe(401);
  });
});

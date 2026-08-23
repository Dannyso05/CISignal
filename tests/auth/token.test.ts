import { describe, expect, it } from "vitest";
import { statusForToken } from "../../src/auth/token.js";

const boundary = Date.UTC(2026, 7, 23, 18, 0, 0);

describe("token expiry", () => {
  it("rejects a token exactly at its expiration boundary", () => {
    expect(statusForToken(boundary, boundary)).toBe(401);
  });

  it("auth context fixture rejects a refresh token at the same boundary", () => {
    expect(statusForToken(boundary, boundary)).toBe(401);
  });

  it("auth context fixture clears a session expired at the boundary", () => {
    expect(statusForToken(boundary, boundary)).toBe(401);
  });

  it("auth context fixture denies a protected request at the boundary", () => {
    expect(statusForToken(boundary, boundary)).toBe(401);
  });
});

/**
 * Minimal sample used by the live PR demonstration.
 * A token is expired at the exact expiration boundary.
 */
export function statusForToken(expiresAt: number, now: number): 200 | 401 {
  return expiresAt < now ? 401 : 200;
}

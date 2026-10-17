import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// No accounts: each shop gets a secret owner link (/shop/<slug>?k=<token>).
// We store only sha256(token). Owner API calls send the token in the
// `x-owner-token` header (the dashboard keeps it in localStorage).

export const OWNER_HEADER = "x-owner-token";

export function newOwnerToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashOwnerToken(token) };
}

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function ownerTokenMatches(token: string | null | undefined, storedHash: string): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashOwnerToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ownerTokenFrom(req: Request): string | null {
  return req.headers.get(OWNER_HEADER);
}

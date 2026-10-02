import { createHash, randomBytes } from "node:crypto";

/** SHA-256 hex digest of an invite token. Only this hash is ever stored. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A fresh random invite token (256 bits, URL-safe) and its hash. The token goes in the
 * accept/decline link and is shown once; the hash is what the database keeps.
 */
export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

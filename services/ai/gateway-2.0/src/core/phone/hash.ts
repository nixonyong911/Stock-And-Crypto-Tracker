import { createHash } from "crypto";

/**
 * Normalize phone to E.164 and produce a salted SHA-256 hash.
 * Strips spaces, dashes, parentheses; ensures "+" prefix.
 */
export function hashPhone(phone: string, salt: string): string {
  const normalized = phone.replace(/[\s\-()]/g, "");
  return createHash("sha256")
    .update(salt + normalized)
    .digest("hex");
}

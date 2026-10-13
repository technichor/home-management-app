import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts secrets kept in the database (Google tokens) with AES-256-GCM, under TOKEN_ENCRYPTION_KEY (32 random bytes,
// base64; in Vercel and .env.local, never in the repo). A stolen database copy or backup alone can't be read. The
// stored form is "v1:" + base64(iv | auth tag | ciphertext); the version prefix leaves room for rotating the key.

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  const bytes = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64");
  return bytes;
}

/** Whether a usable key is configured. */
export function secretBoxReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** The plaintext, or an error if the value was tampered with, made under another key, or isn't one of ours. */
export function open(sealed: string): string {
  const [version, payload] = sealed.split(":");
  if (version !== VERSION || !payload) throw new Error("Not a sealed value");
  const bytes = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

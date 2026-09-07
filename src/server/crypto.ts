import crypto from "node:crypto";

/**
 * Envelope encryption for merchant credentials (WhatsApp tokens, delivery API
 * keys, Telegram bot tokens, Google service accounts...).
 * Secrets are NEVER returned to the browser — only masked previews.
 */

const RAW_KEY = process.env.CREDENTIALS_KEY || "dev-only-insecure-key-change-me-please-32";
const KEY = crypto.createHash("sha256").update(RAW_KEY).digest();

export function encryptSecret(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const plain = Buffer.from(JSON.stringify(value ?? null), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret<T = Record<string, string>>(blob: string | null | undefined): T | null {
  if (!blob) return null;
  try {
    const [version, ivB, tagB, dataB] = blob.split(".");
    if (version !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const out = Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Masked preview safe for the dashboard, e.g. "EAAG••••••3f9a". */
export function maskSecret(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

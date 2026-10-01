import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
/** 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L). */
export function newPairingCode(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return [...randomBytes(8)].map((b) => A[b % A.length]).join("");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
}

export type Device = { id: string; facility: string; worker: string };

export function deviceForToken(db: DatabaseSync, token: string): Device | null {
  const row = db.prepare("SELECT id, facility, worker FROM devices WHERE token_hash = ? AND revoked_at IS NULL").get(sha256(token)) as Device | undefined;
  return row ?? null;
}

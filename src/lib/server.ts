import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function randomCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
  return s;
}

export function randomToken() {
  return crypto.randomUUID();
}

export function cleanName(n: unknown, fallback: string) {
  if (typeof n !== "string") return fallback;
  const t = n.replace(/[^\p{L}\p{N} _\-.]/gu, "").trim().slice(0, 16);
  return t || fallback;
}

/**
 * Constant-time comparison for admin key.
 * Requires ADMIN_PASSWORD env var to be set — refuses access if missing.
 */
export function isAdmin(req: Request) {
  const key = req.headers.get("x-admin-key");
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !key) return false;
  if (key.length !== expected.length) return false;
  // constant-time compare to prevent timing attacks
  let mismatch = 0;
  for (let i = 0; i < key.length; i++) {
    mismatch |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Simple admin auth for prototype: one admin via env ADMIN_NAME + ADMIN_PASSWORD.
 * Session stored in HttpOnly cookie; no DB.
 */
import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days
const SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.ADMIN_PASSWORD ||
  "change-me-in-production";

function parseCookie(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((s) => {
      const i = s.indexOf("=");
      const k = (i < 0 ? s : s.slice(0, i)).trim();
      const v = i < 0 ? "" : s.slice(i + 1).trim();
      return [k, decodeURIComponent(v)];
    })
  );
}

function sign(payload: string): string {
  const hmac = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${hmac}`;
}

function verify(value: string): { name: string } | null {
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const payload = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8")))
    return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    if (parsed.name && parsed.name === process.env.ADMIN_NAME) return { name: parsed.name };
  } catch {
    return null;
  }
  return null;
}

export function getAdminFromRequest(req: Request): { name: string } | null {
  const cookies = parseCookie(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  return verify(raw);
}

export function setAdminCookie(res: Response, name: string): void {
  const payloadB64 = Buffer.from(
    JSON.stringify({ name, exp: Date.now() + MAX_AGE_SEC * 1000 }),
    "utf8"
  ).toString("base64url");
  const value = sign(payloadB64);
  res.setHeader("Set-Cookie", [
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`,
  ].join("; "));
}

export function clearAdminCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    res.status(401).json({ message: "Admin login required" });
    return;
  }
  (req as any).admin = admin;
  next();
}

export function checkAdminCredentials(name: string, password: string): boolean {
  const wantName = process.env.ADMIN_NAME;
  const wantPass = process.env.ADMIN_PASSWORD;
  if (!wantName || !wantPass) return false;
  return name === wantName && password === wantPass;
}

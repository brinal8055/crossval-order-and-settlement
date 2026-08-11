import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "crossval_session";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(now: Date, ttlSeconds: number): Date {
  return new Date(now.getTime() + ttlSeconds * 1_000);
}

export function sessionCookieOptions(
  nodeEnvironment: "development" | "test" | "production",
  ttlSeconds: number,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: nodeEnvironment === "production",
    path: "/",
    maxAge: ttlSeconds,
  };
}

import { describe, expect, it } from "vitest";

import { isSameOrigin } from "@/server/auth/security";
import {
  createSessionToken,
  hashSessionToken,
  sessionExpiry,
  sessionCookieOptions,
} from "@/server/auth/session";
import { normalizeEmail } from "@/server/auth/service";

describe("authentication primitives", () => {
  it("normalizes email and keeps session tokens opaque", () => {
    const token = createSessionToken();

    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
    expect(token).not.toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("calculates expiry and production cookie policy", () => {
    const now = new Date("2026-08-11T10:00:00.000Z");

    expect(sessionExpiry(now, 60).toISOString()).toBe("2026-08-11T10:01:00.000Z");
    expect(sessionCookieOptions("production", 60)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60,
    });
  });

  it("compares origin structure and rejects lookalikes", () => {
    expect(isSameOrigin("https://crossval.example.com", "https://crossval.example.com")).toBe(true);
    expect(isSameOrigin("https://crossval.example.com:443", "https://crossval.example.com")).toBe(true);
    expect(isSameOrigin("https://crossval.example.com.attacker.com", "https://crossval.example.com")).toBe(false);
    expect(isSameOrigin(null, "https://crossval.example.com")).toBe(false);
    expect(isSameOrigin("not-an-origin", "https://crossval.example.com")).toBe(false);
  });
});

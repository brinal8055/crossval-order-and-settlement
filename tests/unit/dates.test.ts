import { describe, expect, it } from "vitest";

import {
  assertValidBusinessDate,
  isValidBusinessDate,
} from "@/domain/dates";

describe("business dates", () => {
  it.each(["2026-08-10", "2024-02-29", "0001-01-01"])(
    "accepts %s",
    (value) => {
      expect(isValidBusinessDate(value)).toBe(true);
      expect(() => assertValidBusinessDate(value)).not.toThrow();
    },
  );

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "10/08/2026",
    "2026-8-1",
    "2026-01-01T00:00:00Z",
  ])("rejects invalid date %s", (value) => {
    expect(isValidBusinessDate(value)).toBe(false);
    expect(() => assertValidBusinessDate(value)).toThrowError(
      expect.objectContaining({ code: "INVALID_DATE" }),
    );
  });
});


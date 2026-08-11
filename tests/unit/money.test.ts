import { describe, expect, it } from "vitest";

import {
  assertMoneyWithinLimit,
  formatMoney,
  MAX_MONEY_CENTS,
  parseMoney,
} from "@/domain/money";
import { DomainError } from "@/domain/errors";

describe("money", () => {
  it.each([
    ["0", 0n],
    ["0.01", 1n],
    ["1", 100n],
    ["1.2", 120n],
    ["1.20", 120n],
    ["500", 50_000n],
    ["500.00", 50_000n],
    [" 500.00 ", 50_000n],
  ])("parses %s as %s cents", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "-1", "1.001", "1e5", "$500", "1,000", "Infinity", "NaN", "abc"])(
    "rejects invalid money %s",
    (input) => {
      expect(() => parseMoney(input)).toThrowError(DomainError);
    },
  );

  it.each([
    [0n, "0.00"],
    [1n, "0.01"],
    [120n, "1.20"],
    [50_000n, "500.00"],
  ])("formats %s cents as %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it("accepts the business cap and rejects the next cent", () => {
    expect(() => assertMoneyWithinLimit(MAX_MONEY_CENTS)).not.toThrow();
    expect(() => assertMoneyWithinLimit(MAX_MONEY_CENTS + 1n)).toThrowError(
      expect.objectContaining({ code: "MONEY_LIMIT_EXCEEDED" }),
    );
  });

  it("rejects negative cents at the business boundary", () => {
    expect(() => assertMoneyWithinLimit(-1n)).toThrowError(
      expect.objectContaining({ code: "INVALID_MONEY" }),
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  calculateLineTotal,
  calculateOrderTotal,
  deriveAmountPaidCents,
  MAX_LINE_ITEMS,
  MAX_QUANTITY,
} from "@/domain/order-calculation";
import { MAX_MONEY_CENTS, parseMoney } from "@/domain/money";

describe("order calculations", () => {
  it("calculates a line total with integer cents", () => {
    expect(
      calculateLineTotal({ quantity: 2, unitPriceCents: parseMoney("500") }),
    ).toBe(parseMoney("1000"));
  });

  it("calculates a multi-line order total", () => {
    expect(
      calculateOrderTotal([
        { quantity: 2, unitPriceCents: parseMoney("500") },
        { quantity: 3, unitPriceCents: parseMoney("12.50") },
      ]),
    ).toBe(parseMoney("1037.50"));
  });

  it.each([0, 1.5, MAX_QUANTITY + 1])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(() =>
        calculateLineTotal({ quantity, unitPriceCents: 100n }),
      ).toThrowError(expect.objectContaining({ code: "INVALID_QUANTITY" }));
    },
  );

  it("accepts the maximum quantity", () => {
    expect(calculateLineTotal({ quantity: MAX_QUANTITY, unitPriceCents: 0n })).toBe(
      0n,
    );
  });

  it("rejects an empty, oversized, or zero-total order", () => {
    expect(() => calculateOrderTotal([])).toThrowError(
      expect.objectContaining({ code: "INVALID_LINE_ITEMS" }),
    );
    expect(() =>
      calculateOrderTotal(
        Array.from({ length: MAX_LINE_ITEMS + 1 }, () => ({
          quantity: 1,
          unitPriceCents: 1n,
        })),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_LINE_ITEMS" }));
    expect(() =>
      calculateOrderTotal([{ quantity: 1, unitPriceCents: 0n }]),
    ).toThrowError(expect.objectContaining({ code: "ZERO_TOTAL_ORDER" }));
  });

  it("enforces the money cap on line and order totals", () => {
    expect(() =>
      calculateLineTotal({ quantity: 2, unitPriceCents: MAX_MONEY_CENTS }),
    ).toThrowError(expect.objectContaining({ code: "MONEY_LIMIT_EXCEEDED" }));
  });

  it("derives amount paid from total and amount due", () => {
    expect(deriveAmountPaidCents(100_000n, 60_000n)).toBe(40_000n);
  });

  it.each([
    [0n, 0n],
    [100n, -1n],
    [100n, 101n],
  ])("rejects invalid balance %s/%s", (total, due) => {
    expect(() => deriveAmountPaidCents(total, due)).toThrowError(
      expect.objectContaining({ code: "INVALID_BALANCE" }),
    );
  });
});


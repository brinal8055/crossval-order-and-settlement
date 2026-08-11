import { describe, expect, it } from "vitest";

import { deriveOrderStatus } from "@/domain/order-status";

const total = 100_000n;
const today = "2026-08-10";

describe("order status", () => {
  it("derives pending before the due date with no settlement", () => {
    expect(deriveOrderStatus(total, total, "2026-08-11", today)).toBe(
      "pending",
    );
  });

  it("derives partially_paid before the due date", () => {
    expect(deriveOrderStatus(total, 60_000n, "2026-08-11", today)).toBe(
      "partially_paid",
    );
  });

  it("derives overdue after the due date when money remains", () => {
    expect(deriveOrderStatus(total, 60_000n, "2026-08-09", today)).toBe(
      "overdue",
    );
  });

  it("derives paid even when the due date has passed", () => {
    expect(deriveOrderStatus(total, 0n, "2026-08-09", today)).toBe("paid");
  });

  it("treats the due date as not overdue", () => {
    expect(deriveOrderStatus(total, total, today, today)).toBe("pending");
  });
});


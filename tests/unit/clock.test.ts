import { describe, expect, it } from "vitest";

import { FixedClock, SystemClock } from "@/domain/clock";

describe("clocks", () => {
  it("uses UTC for the fixed business date", () => {
    const clock = new FixedClock(new Date("2026-08-10T23:30:00.000Z"));

    expect(clock.today()).toBe("2026-08-10");
    expect(clock.now()).toEqual(new Date("2026-08-10T23:30:00.000Z"));
  });

  it("does not expose mutable internal time", () => {
    const clock = new FixedClock(new Date("2026-08-10T12:00:00.000Z"));
    const value = clock.now();

    value.setUTCDate(11);

    expect(clock.today()).toBe("2026-08-10");
  });

  it("returns the current UTC date from the system clock", () => {
    const before = Date.now();
    const clock = new SystemClock();
    const after = Date.now();
    const today = clock.today();

    expect(clock.now().getTime()).toBeGreaterThanOrEqual(before);
    expect(clock.now().getTime()).toBeLessThanOrEqual(after + 1000);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});


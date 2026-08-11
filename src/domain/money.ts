import { DomainError } from "./errors";

export const MAX_MONEY_CENTS = 100_000_000_000n;

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function parseMoney(input: string): bigint {
  const normalized = input.trim();

  if (!MONEY_PATTERN.test(normalized)) {
    throw new DomainError(
      "INVALID_MONEY",
      "Money must be a non-negative decimal amount with at most two decimal places.",
    );
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const centsPart = fractionalPart.padEnd(2, "0");

  return BigInt(wholePart) * 100n + BigInt(centsPart || "0");
}

export function formatMoney(value: bigint): string {
  if (value < 0n) {
    throw new DomainError("INVALID_MONEY", "Money cannot be negative.");
  }

  const wholePart = value / 100n;
  const centsPart = (value % 100n).toString().padStart(2, "0");

  return `${wholePart}.${centsPart}`;
}

export function assertMoneyWithinLimit(value: bigint): void {
  if (value < 0n) {
    throw new DomainError("INVALID_MONEY", "Money cannot be negative.");
  }

  if (value > MAX_MONEY_CENTS) {
    throw new DomainError(
      "MONEY_LIMIT_EXCEEDED",
      "The monetary amount exceeds the supported limit.",
    );
  }
}

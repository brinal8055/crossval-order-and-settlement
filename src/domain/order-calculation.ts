import { assertMoneyWithinLimit } from "./money";
import { DomainError } from "./errors";

export const MAX_QUANTITY = 1_000_000;
export const MAX_LINE_ITEMS = 100;

export interface OrderLineInput {
  quantity: number;
  unitPriceCents: bigint;
}

export function calculateLineTotal(line: OrderLineInput): bigint {
  assertQuantity(line.quantity);

  if (line.unitPriceCents < 0n) {
    throw new DomainError("INVALID_MONEY", "Unit price cannot be negative.");
  }

  const lineTotal = BigInt(line.quantity) * line.unitPriceCents;
  assertMoneyWithinLimit(line.unitPriceCents);
  assertMoneyWithinLimit(lineTotal);

  return lineTotal;
}

export function calculateOrderTotal(lines: readonly OrderLineInput[]): bigint {
  if (lines.length === 0 || lines.length > MAX_LINE_ITEMS) {
    throw new DomainError(
      "INVALID_LINE_ITEMS",
      `An order must contain between 1 and ${MAX_LINE_ITEMS} line items.`,
    );
  }

  const total = lines.reduce(
    (sum, line) => sum + calculateLineTotal(line),
    0n,
  );

  assertMoneyWithinLimit(total);

  if (total === 0n) {
    throw new DomainError(
      "ZERO_TOTAL_ORDER",
      "An order total must be greater than zero.",
    );
  }

  return total;
}

export function deriveAmountPaidCents(
  totalCents: bigint,
  amountDueCents: bigint,
): bigint {
  if (
    totalCents <= 0n ||
    amountDueCents < 0n ||
    amountDueCents > totalCents
  ) {
    throw new DomainError(
      "INVALID_BALANCE",
      "Order balance must satisfy 0 <= amountDue <= total.",
    );
  }

  return totalCents - amountDueCents;
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new DomainError(
      "INVALID_QUANTITY",
      `Quantity must be an integer between 1 and ${MAX_QUANTITY}.`,
    );
  }
}


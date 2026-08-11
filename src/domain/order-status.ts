export type OrderStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "overdue";

export function deriveOrderStatus(
  totalCents: bigint,
  amountDueCents: bigint,
  dueDate: string,
  today: string,
): OrderStatus {
  if (amountDueCents === 0n) {
    return "paid";
  }

  if (dueDate < today) {
    return "overdue";
  }

  if (amountDueCents < totalCents) {
    return "partially_paid";
  }

  return "pending";
}


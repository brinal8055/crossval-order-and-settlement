export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function ordersToCsv(
  orders: readonly {
    id: string;
    customer: string;
    status: string;
    total: string;
    amountPaid: string;
    amountDue: string;
    dueDate: string;
    createdAt: string;
  }[],
): string {
  const header = [
    "order_id",
    "customer",
    "status",
    "total",
    "amount_paid",
    "amount_due",
    "due_date",
    "created_at",
  ];
  const rows = orders.map((order) => [
    order.id,
    order.customer,
    order.status,
    order.total,
    order.amountPaid,
    order.amountDue,
    order.dueDate,
    order.createdAt,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

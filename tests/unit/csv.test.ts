import { describe, expect, it } from "vitest";

import { csvCell, ordersToCsv } from "@/server/orders/csv";

describe("order CSV export", () => {
  it("escapes commas, quotes, and line breaks", () => {
    expect(csvCell('Acme, "North"')).toBe('"Acme, ""North"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("writes a stable reviewer-friendly order export", () => {
    expect(ordersToCsv([
      {
        id: "order-1",
        customer: "Acme",
        status: "partially_paid",
        total: "100.00",
        amountPaid: "40.00",
        amountDue: "60.00",
        dueDate: "2026-08-20",
        createdAt: "2026-08-12T10:00:00.000Z",
      },
    ])).toBe(
      "order_id,customer,status,total,amount_paid,amount_due,due_date,created_at\r\n" +
      "order-1,Acme,partially_paid,100.00,40.00,60.00,2026-08-20,2026-08-12T10:00:00.000Z\r\n",
    );
  });
});

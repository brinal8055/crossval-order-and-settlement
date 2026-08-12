import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";

import {
  calculateLineTotal,
  calculateOrderTotal,
  deriveAmountPaidCents,
} from "@/domain/order-calculation";
import { assertValidBusinessDate } from "@/domain/dates";
import { SystemClock } from "@/domain/clock";
import { formatMoney, parseMoney } from "@/domain/money";
import { deriveOrderStatus, type OrderStatus } from "@/domain/order-status";
import type { OrderDocument, OrderLineDocument } from "@/server/db/documents";
import { OrderRepository } from "@/server/db/repositories/order-repository";

export const MAX_ORDER_PAGE_LIMIT = 100;

export interface OrderInputLine {
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface OrderInput {
  customer: string;
  dueDate: string;
  lines: OrderInputLine[];
}

export interface OrderPatchInput {
  version: number;
  customer?: string;
  dueDate?: string;
  lines?: OrderInputLine[];
}

export type OrderFailure =
  | "ORDER_NOT_FOUND"
  | "ORDER_LOCKED_AFTER_PAYMENT"
  | "ORDER_VERSION_CONFLICT";

export function toOrderDto(document: OrderDocument, today = new SystemClock().today()) {
  const amountPaidCents = deriveAmountPaidCents(
    document.totalCents,
    document.amountDueCents,
  );
  return {
    id: document._id.toHexString(),
    customer: document.customer,
    dueDate: document.dueDate,
    currency: document.currency,
    lines: document.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: formatMoney(line.unitPriceCents),
      lineTotal: formatMoney(calculateLineTotal(line)),
    })),
    subtotal: formatMoney(document.totalCents),
    total: formatMoney(document.totalCents),
    amountPaid: formatMoney(amountPaidCents),
    amountDue: formatMoney(document.amountDueCents),
    status: deriveOrderStatus(
      document.totalCents,
      document.amountDueCents,
      document.dueDate,
      today,
    ),
    version: document.version,
    editable: document.paymentCount === 0,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function normalizeLines(lines: OrderInputLine[]): OrderLineDocument[] {
  return lines.map((line) => ({
    id: randomUUID(),
    description: line.description.trim(),
    quantity: line.quantity,
    unitPriceCents: parseMoney(line.unitPrice),
  }));
}

function normalizeOrderInput(input: OrderInput): {
  customer: string;
  dueDate: string;
  lines: OrderLineDocument[];
  totalCents: bigint;
} {
  const customer = input.customer.trim();
  const lines = normalizeLines(input.lines);
  assertValidBusinessDate(input.dueDate);
  const totalCents = calculateOrderTotal(lines);
  return { customer, dueDate: input.dueDate, lines, totalCents };
}

export async function createOrder(
  userId: ObjectId,
  input: OrderInput,
  repository: OrderRepository,
  now = new Date(),
): Promise<OrderDocument> {
  const normalized = normalizeOrderInput(input);
  const document: OrderDocument = {
    _id: new ObjectId(),
    userId,
    customer: normalized.customer,
    dueDate: normalized.dueDate,
    currency: "USD",
    lines: normalized.lines,
    totalCents: normalized.totalCents,
    amountDueCents: normalized.totalCents,
    paymentCount: 0,
    refundCount: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await repository.insert(document);
  return document;
}

export async function patchOrder(
  userId: ObjectId,
  orderId: ObjectId,
  input: OrderPatchInput,
  repository: OrderRepository,
  now = new Date(),
): Promise<{ order: OrderDocument } | { failure: OrderFailure }> {
  const current = await repository.findByIdForUser(orderId, userId);
  if (!current) return { failure: "ORDER_NOT_FOUND" };
  if (current.paymentCount > 0) return { failure: "ORDER_LOCKED_AFTER_PAYMENT" };

  const patch: Parameters<OrderRepository["updateBeforePayment"]>[3] = {};
  if (input.customer !== undefined) patch.customer = input.customer.trim();
  if (input.dueDate !== undefined) {
    assertValidBusinessDate(input.dueDate);
    patch.dueDate = input.dueDate;
  }
  if (input.lines !== undefined) {
    const lines = normalizeLines(input.lines);
    patch.lines = lines;
    patch.totalCents = calculateOrderTotal(lines);
    patch.amountDueCents = patch.totalCents;
  }

  const updated = await repository.updateBeforePayment(
    orderId,
    userId,
    input.version,
    patch,
    now,
  );
  return updated
    ? { order: updated }
    : { failure: "ORDER_VERSION_CONFLICT" };
}

export async function deleteOrder(
  userId: ObjectId,
  orderId: ObjectId,
  expectedVersion: number,
  repository: OrderRepository,
): Promise<{ deleted: true } | { failure: OrderFailure }> {
  const current = await repository.findByIdForUser(orderId, userId);
  if (!current) return { failure: "ORDER_NOT_FOUND" };
  if (current.paymentCount > 0) return { failure: "ORDER_LOCKED_AFTER_PAYMENT" };
  const deleted = await repository.deleteBeforePayment(orderId, userId, expectedVersion);
  return deleted ? { deleted: true } : { failure: "ORDER_VERSION_CONFLICT" };
}

export function parseOrderId(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export function parseOrderStatus(value: string | null): OrderStatus | undefined {
  if (!value) return undefined;
  return ["pending", "partially_paid", "paid", "overdue"].includes(value)
    ? (value as OrderStatus)
    : undefined;
}

import { createHash } from "node:crypto";
import type { MongoClient } from "mongodb";
import { ObjectId } from "mongodb";

import { assertValidBusinessDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { assertMoneyWithinLimit, formatMoney, parseMoney } from "@/domain/money";
import { deriveOrderStatus } from "@/domain/order-status";
import type { PaymentDocument } from "@/server/db/documents";
import { AuditRepository } from "@/server/db/repositories/audit-repository";
import { OrderRepository } from "@/server/db/repositories/order-repository";
import { PaymentRepository } from "@/server/db/repositories/payment-repository";

export interface PaymentInput {
  amount: string;
  paymentDate: string;
  note?: string;
}

export interface SettlementRepositories {
  orders: OrderRepository;
  payments: PaymentRepository;
  audit: AuditRepository;
}

export type SettlementFailureCode =
  | "ORDER_NOT_FOUND"
  | "OVERPAYMENT"
  | "IDEMPOTENCY_KEY_REUSED";

export class SettlementError extends Error {
  constructor(
    readonly code: SettlementFailureCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "SettlementError";
  }
}

export function paymentRequestHash(
  orderId: ObjectId,
  amountCents: bigint,
  paymentDate: string,
  note: string,
): string {
  const canonical = [
    "payment:v1",
    orderId.toHexString(),
    amountCents.toString(),
    paymentDate,
    note,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function toPaymentDto(payment: PaymentDocument) {
  return {
    id: payment._id.toHexString(),
    sequence: payment.sequence,
    amount: formatMoney(payment.amountCents),
    paymentDate: payment.paymentDate,
    recordedAt: payment.recordedAt.toISOString(),
    ...(payment.note ? { note: payment.note } : {}),
    balanceBefore: formatMoney(payment.balanceBeforeCents),
    balanceAfter: formatMoney(payment.balanceAfterCents),
  };
}

function normalizeInput(
  orderId: ObjectId,
  input: PaymentInput,
  today: string,
): { amountCents: bigint; paymentDate: string; note: string; requestHash: string } {
  const amountCents = parseMoney(input.amount);
  assertMoneyWithinLimit(amountCents);
  if (amountCents <= 0n) {
    throw new DomainError("INVALID_MONEY", "Payment amount must be greater than zero.");
  }
  assertValidBusinessDate(input.paymentDate);
  if (input.paymentDate > today) {
    throw new DomainError("INVALID_DATE", "Payment date cannot be in the future.");
  }
  const note = input.note?.trim() ?? "";
  return {
    amountCents,
    paymentDate: input.paymentDate,
    note,
    requestHash: paymentRequestHash(orderId, amountCents, input.paymentDate, note),
  };
}

function assertMatchingRequest(
  existing: PaymentDocument,
  requestHash: string,
): void {
  if (existing.requestHash !== requestHash) {
    throw new SettlementError(
      "IDEMPOTENCY_KEY_REUSED",
      "The idempotency key was already used for a different payment request.",
    );
  }
}

export async function settlePayment(
  client: MongoClient,
  userId: ObjectId,
  orderId: ObjectId,
  idempotencyKey: string,
  input: PaymentInput,
  repositories: SettlementRepositories,
  today: string,
  recordedAt = new Date(),
): Promise<{ payment: PaymentDocument; replayed: boolean }> {
  const normalized = normalizeInput(orderId, input, today);
  const existing = await repositories.payments.findByIdempotencyKey(userId, idempotencyKey);
  if (existing) {
    assertMatchingRequest(existing, normalized.requestHash);
    return { payment: existing, replayed: true };
  }

  try {
    const transactionResult = await client.withSession(async (session) =>
      session.withTransaction(
        async () => {
          const inTransaction = await repositories.payments.findByIdempotencyKey(
            userId,
            idempotencyKey,
            session,
          );
          if (inTransaction) {
            assertMatchingRequest(inTransaction, normalized.requestHash);
            return { payment: inTransaction, replayed: true };
          }

          const previousOrder = await repositories.orders.settle(
            orderId,
            userId,
            normalized.amountCents,
            recordedAt,
            session,
          );
          if (!previousOrder) return null;

          const payment: PaymentDocument = {
            _id: new ObjectId(),
            userId,
            orderId,
            sequence: previousOrder.paymentCount + 1,
            amountCents: normalized.amountCents,
            paymentDate: normalized.paymentDate,
            ...(normalized.note ? { note: normalized.note } : {}),
            idempotencyKey,
            requestHash: normalized.requestHash,
            balanceBeforeCents: previousOrder.amountDueCents,
            balanceAfterCents: previousOrder.amountDueCents - normalized.amountCents,
            recordedAt,
          };
          await repositories.payments.insert(payment, session);
          await repositories.audit.insert({
            _id: new ObjectId(),
            userId,
            orderId,
            action: "PAYMENT_RECORDED",
            details: {
              amount: formatMoney(payment.amountCents),
              paymentDate: payment.paymentDate,
              balanceBefore: formatMoney(payment.balanceBeforeCents),
              balanceAfter: formatMoney(payment.balanceAfterCents),
              statusBefore: deriveOrderStatus(
                previousOrder.totalCents,
                previousOrder.amountDueCents,
                previousOrder.dueDate,
                today,
              ),
              statusAfter: deriveOrderStatus(
                previousOrder.totalCents,
                payment.balanceAfterCents,
                previousOrder.dueDate,
                today,
              ),
            },
            occurredAt: recordedAt,
          }, session);
          return { payment, replayed: false };
        },
        {
          readPreference: "primary",
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
        },
      ),
    );
    if (transactionResult) return transactionResult;
  } catch (error) {
    if (error instanceof SettlementError) throw error;
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const concurrent = await repositories.payments.findByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (concurrent) {
        assertMatchingRequest(concurrent, normalized.requestHash);
        return { payment: concurrent, replayed: true };
      }
    }
    throw error;
  }

  const currentOrder = await repositories.orders.findByIdForUser(orderId, userId);
  if (!currentOrder) {
    throw new SettlementError("ORDER_NOT_FOUND", "Order was not found.");
  }
  throw new SettlementError(
    "OVERPAYMENT",
    "Payment exceeds the outstanding order balance.",
    {
      attempted: formatMoney(normalized.amountCents),
      maximumAllowed: formatMoney(currentOrder.amountDueCents),
    },
  );
}

import { createHash } from "node:crypto";
import type { MongoClient } from "mongodb";
import { ObjectId } from "mongodb";

import { assertValidBusinessDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { assertMoneyWithinLimit, formatMoney, parseMoney } from "@/domain/money";
import { deriveOrderStatus } from "@/domain/order-status";
import type { RefundDocument } from "@/server/db/documents";
import { AuditRepository } from "@/server/db/repositories/audit-repository";
import { OrderRepository } from "@/server/db/repositories/order-repository";
import { RefundRepository } from "@/server/db/repositories/refund-repository";

export interface RefundInput {
  amount: string;
  refundDate: string;
  note?: string;
}

export interface RefundRepositories {
  orders: OrderRepository;
  refunds: RefundRepository;
  audit: AuditRepository;
}

export type RefundFailureCode = "ORDER_NOT_FOUND" | "OVERREFUND" | "IDEMPOTENCY_KEY_REUSED";

export class RefundError extends Error {
  constructor(
    readonly code: RefundFailureCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "RefundError";
  }
}

export function refundRequestHash(
  orderId: ObjectId,
  amountCents: bigint,
  refundDate: string,
  note: string,
): string {
  return createHash("sha256")
    .update(["refund:v1", orderId.toHexString(), amountCents.toString(), refundDate, note].join("|"))
    .digest("hex");
}

export function toRefundDto(refund: RefundDocument) {
  return {
    id: refund._id.toHexString(),
    sequence: refund.sequence,
    amount: formatMoney(refund.amountCents),
    refundDate: refund.refundDate,
    recordedAt: refund.recordedAt.toISOString(),
    ...(refund.note ? { note: refund.note } : {}),
    balanceBefore: formatMoney(refund.balanceBeforeCents),
    balanceAfter: formatMoney(refund.balanceAfterCents),
  };
}

function assertMatchingRequest(existing: RefundDocument, requestHash: string): void {
  if (existing.requestHash !== requestHash) {
    throw new RefundError(
      "IDEMPOTENCY_KEY_REUSED",
      "The idempotency key was already used for a different refund request.",
    );
  }
}

function normalizeInput(orderId: ObjectId, input: RefundInput, today: string) {
  const amountCents = parseMoney(input.amount);
  assertMoneyWithinLimit(amountCents);
  if (amountCents <= 0n) throw new DomainError("INVALID_MONEY", "Refund amount must be greater than zero.");
  assertValidBusinessDate(input.refundDate);
  if (input.refundDate > today) throw new DomainError("INVALID_DATE", "Refund date cannot be in the future.");
  const note = input.note?.trim() ?? "";
  return {
    amountCents,
    refundDate: input.refundDate,
    note,
    requestHash: refundRequestHash(orderId, amountCents, input.refundDate, note),
  };
}

export async function refundPayment(
  client: MongoClient,
  userId: ObjectId,
  orderId: ObjectId,
  idempotencyKey: string,
  input: RefundInput,
  repositories: RefundRepositories,
  today: string,
  recordedAt = new Date(),
): Promise<{ refund: RefundDocument; replayed: boolean }> {
  const normalized = normalizeInput(orderId, input, today);
  const existing = await repositories.refunds.findByIdempotencyKey(userId, idempotencyKey);
  if (existing) {
    assertMatchingRequest(existing, normalized.requestHash);
    return { refund: existing, replayed: true };
  }

  try {
    const transactionResult = await client.withSession(async (session) =>
      session.withTransaction(
        async () => {
          const inTransaction = await repositories.refunds.findByIdempotencyKey(userId, idempotencyKey, session);
          if (inTransaction) {
            assertMatchingRequest(inTransaction, normalized.requestHash);
            return { refund: inTransaction, replayed: true };
          }

          const previousOrder = await repositories.orders.refund(
            orderId,
            userId,
            normalized.amountCents,
            recordedAt,
            session,
          );
          if (!previousOrder) return null;

          const refund: RefundDocument = {
            _id: new ObjectId(),
            userId,
            orderId,
            sequence: (previousOrder.refundCount ?? 0) + 1,
            amountCents: normalized.amountCents,
            refundDate: normalized.refundDate,
            ...(normalized.note ? { note: normalized.note } : {}),
            idempotencyKey,
            requestHash: normalized.requestHash,
            balanceBeforeCents: previousOrder.amountDueCents,
            balanceAfterCents: previousOrder.amountDueCents + normalized.amountCents,
            recordedAt,
          };
          await repositories.refunds.insert(refund, session);
          await repositories.audit.insert({
            _id: new ObjectId(),
            userId,
            orderId,
            action: "REFUND_RECORDED",
            details: {
              amount: formatMoney(refund.amountCents),
              refundDate: refund.refundDate,
              balanceBefore: formatMoney(refund.balanceBeforeCents),
              balanceAfter: formatMoney(refund.balanceAfterCents),
              statusBefore: deriveOrderStatus(
                previousOrder.totalCents,
                previousOrder.amountDueCents,
                previousOrder.dueDate,
                today,
              ),
              statusAfter: deriveOrderStatus(
                previousOrder.totalCents,
                refund.balanceAfterCents,
                previousOrder.dueDate,
                today,
              ),
            },
            occurredAt: recordedAt,
          }, session);
          return { refund, replayed: false };
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
    if (error instanceof RefundError) throw error;
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const concurrent = await repositories.refunds.findByIdempotencyKey(userId, idempotencyKey);
      if (concurrent) {
        assertMatchingRequest(concurrent, normalized.requestHash);
        return { refund: concurrent, replayed: true };
      }
    }
    throw error;
  }

  const currentOrder = await repositories.orders.findByIdForUser(orderId, userId);
  if (!currentOrder) throw new RefundError("ORDER_NOT_FOUND", "Order was not found.");
  throw new RefundError(
    "OVERREFUND",
    "Refund exceeds the amount paid on the order.",
    {
      attempted: formatMoney(normalized.amountCents),
      maximumAllowed: formatMoney(currentOrder.totalCents - currentOrder.amountDueCents),
    },
  );
}

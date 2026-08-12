import type { ObjectId } from "mongodb";

export interface UserDocument {
  _id: ObjectId;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDocument {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface OrderLineDocument {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: bigint;
}

export interface OrderDocument {
  _id: ObjectId;
  userId: ObjectId;
  customer: string;
  dueDate: string;
  currency: "USD";
  lines: OrderLineDocument[];
  totalCents: bigint;
  amountDueCents: bigint;
  paymentCount: number;
  refundCount?: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDocument {
  _id: ObjectId;
  userId: ObjectId;
  orderId: ObjectId;
  sequence: number;
  amountCents: bigint;
  paymentDate: string;
  note?: string;
  idempotencyKey: string;
  requestHash: string;
  balanceBeforeCents: bigint;
  balanceAfterCents: bigint;
  recordedAt: Date;
}

export type AuditAction =
  | "PAYMENT_RECORDED"
  | "REFUND_RECORDED";

export interface AuditEventDocument {
  _id: ObjectId;
  userId: ObjectId;
  orderId: ObjectId;
  action: AuditAction;
  details: Record<string, string>;
  occurredAt: Date;
}

export interface RefundDocument {
  _id: ObjectId;
  userId: ObjectId;
  orderId: ObjectId;
  sequence: number;
  amountCents: bigint;
  refundDate: string;
  note?: string;
  idempotencyKey: string;
  requestHash: string;
  balanceBeforeCents: bigint;
  balanceAfterCents: bigint;
  recordedAt: Date;
}

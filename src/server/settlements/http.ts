import { ObjectId } from "mongodb";

import { authenticateRequest } from "@/server/auth/http";
import { PaymentRepository } from "@/server/db/repositories/payment-repository";
import { RefundRepository } from "@/server/db/repositories/refund-repository";
import { AuditRepository } from "@/server/db/repositories/audit-repository";
import { OrderRepository } from "@/server/db/repositories/order-repository";

export async function getSettlementContext(request: Request) {
  const context = await authenticateRequest(request);
  return {
    ...context,
    orderRepository: new OrderRepository(context.collections.orders),
    paymentRepository: new PaymentRepository(context.collections.payments),
    refundRepository: new RefundRepository(context.collections.refunds),
    auditRepository: new AuditRepository(context.collections.auditEvents),
    userId: context.user ? new ObjectId(context.user.id) : null,
  };
}

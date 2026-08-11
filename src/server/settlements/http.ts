import { ObjectId } from "mongodb";

import { authenticateRequest } from "@/server/auth/http";
import { PaymentRepository } from "@/server/db/repositories/payment-repository";
import { OrderRepository } from "@/server/db/repositories/order-repository";

export async function getSettlementContext(request: Request) {
  const context = await authenticateRequest(request);
  return {
    ...context,
    orderRepository: new OrderRepository(context.collections.orders),
    paymentRepository: new PaymentRepository(context.collections.payments),
    userId: context.user ? new ObjectId(context.user.id) : null,
  };
}

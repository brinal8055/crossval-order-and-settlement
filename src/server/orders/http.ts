import { ObjectId } from "mongodb";

import { authenticateRequest } from "@/server/auth/http";
import { OrderRepository } from "@/server/db/repositories/order-repository";

export async function getOrderContext(request: Request) {
  const context = await authenticateRequest(request);
  return {
    ...context,
    orderRepository: new OrderRepository(context.collections.orders),
    userId: context.user ? new ObjectId(context.user.id) : null,
  };
}

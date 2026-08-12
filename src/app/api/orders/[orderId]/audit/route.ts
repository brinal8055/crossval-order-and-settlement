import { NextResponse } from "next/server";

import { errorBody, privateHeaders } from "@/server/http/request";
import { parseOrderId } from "@/server/orders/service";
import { getSettlementContext } from "@/server/settlements/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

function errorResponse(request: Request, code: string, status: number) {
  return NextResponse.json(errorBody(request, code), { status, headers: privateHeaders(request) });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getSettlementContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  const orderId = parseOrderId((await context.params).orderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const order = await auth.orderRepository.findByIdForUser(orderId, auth.userId);
  if (!order) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const events = await auth.auditRepository.findByOrderForUser(orderId, auth.userId);
  return NextResponse.json({
    items: events.map((event) => ({
      id: event._id.toHexString(),
      action: event.action,
      details: event.details,
      occurredAt: event.occurredAt.toISOString(),
    })),
  }, { headers: privateHeaders(request) });
}

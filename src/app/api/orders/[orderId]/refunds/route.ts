import { NextResponse } from "next/server";
import { z } from "zod";

import { DomainError } from "@/domain/errors";
import { formatUtcDate } from "@/domain/dates";
import { isSameOrigin } from "@/server/auth/security";
import { errorBody, privateHeaders, validationDetails } from "@/server/http/request";
import { parseOrderId } from "@/server/orders/service";
import { getSettlementContext } from "@/server/settlements/http";
import { RefundError, refundPayment, toRefundDto } from "@/server/settlements/refund-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };
const refundSchema = z.object({
  amount: z.string().trim().min(1),
  refundDate: z.string(),
  note: z.string().max(1_000).optional(),
}).strict();

function errorResponse(request: Request, code: string, status: number, message = code, details?: Record<string, string>) {
  return NextResponse.json(errorBody(request, code, message, details), { status, headers: privateHeaders(request) });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await getSettlementContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  if (!isSameOrigin(request.headers.get("origin"), auth.environment.APP_ORIGIN)) return errorResponse(request, "ORIGIN_MISMATCH", 403);
  const orderId = parseOrderId((await context.params).orderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) return errorResponse(request, "VALIDATION_ERROR", 400, "A valid Idempotency-Key UUID is required.");
  const parsed = refundSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(request, "VALIDATION_ERROR", 400, "Check the highlighted refund fields.", validationDetails(parsed.error.issues));

  try {
    const recordedAt = new Date();
    const result = await refundPayment(
      auth.client,
      auth.userId,
      orderId,
      idempotencyKey,
      parsed.data,
      { orders: auth.orderRepository, refunds: auth.refundRepository, audit: auth.auditRepository },
      formatUtcDate(recordedAt),
      recordedAt,
    );
    return NextResponse.json({ refund: toRefundDto(result.refund) }, {
      status: result.replayed ? 200 : 201,
      headers: { ...privateHeaders(request), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}) },
    });
  } catch (error) {
    if (error instanceof DomainError) return errorResponse(request, error.code, 400, error.message);
    if (error instanceof RefundError) return errorResponse(request, error.code, error.code === "ORDER_NOT_FOUND" ? 404 : 409, error.message, error.details);
    return errorResponse(request, "REFUND_TEMPORARILY_UNAVAILABLE", 503, "Refund is temporarily unavailable.");
  }
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getSettlementContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  const orderId = parseOrderId((await context.params).orderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const order = await auth.orderRepository.findByIdForUser(orderId, auth.userId);
  if (!order) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const refunds = await auth.refundRepository.findByOrderForUser(orderId, auth.userId);
  return NextResponse.json({ items: refunds.map(toRefundDto) }, { headers: privateHeaders(request) });
}

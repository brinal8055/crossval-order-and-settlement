import { NextResponse } from "next/server";
import { z } from "zod";

import { DomainError } from "@/domain/errors";
import { formatUtcDate } from "@/domain/dates";
import { isSameOrigin } from "@/server/auth/security";
import { getSettlementContext } from "@/server/settlements/http";
import {
  settlePayment,
  SettlementError,
  toPaymentDto,
} from "@/server/settlements/service";
import { parseOrderId } from "@/server/orders/service";
import { errorBody, privateHeaders, validationDetails } from "@/server/http/request";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

const paymentSchema = z.object({
  amount: z.string().trim().min(1),
  paymentDate: z.string(),
  note: z.string().max(1_000).optional(),
}).strict();

function errorResponse(
  request: Request,
  code: string,
  status: number,
  message = code,
  details?: Record<string, string>,
) {
  return NextResponse.json(
    errorBody(request, code, message, details),
    { status, headers: privateHeaders(request) },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await getSettlementContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  if (!isSameOrigin(request.headers.get("origin"), auth.environment.APP_ORIGIN)) {
    return errorResponse(request, "ORIGIN_MISMATCH", 403);
  }
  const { orderId: rawOrderId } = await context.params;
  const orderId = parseOrderId(rawOrderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) {
    return errorResponse(request, "VALIDATION_ERROR", 400, "A valid Idempotency-Key UUID is required.");
  }
  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      request,
      "VALIDATION_ERROR",
      400,
      "Check the highlighted payment fields.",
      validationDetails(parsed.error.issues),
    );
  }

  try {
    const recordedAt = new Date();
    const result = await settlePayment(
      auth.client,
      auth.userId,
      orderId,
      idempotencyKey,
      parsed.data,
      { orders: auth.orderRepository, payments: auth.paymentRepository, audit: auth.auditRepository },
      formatUtcDate(recordedAt),
      recordedAt,
    );
    const response = NextResponse.json(
      { payment: toPaymentDto(result.payment) },
      {
        status: result.replayed ? 200 : 201,
        headers: {
          ...privateHeaders(request),
          ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
        },
      },
    );
    return response;
  } catch (error) {
    if (error instanceof DomainError) return errorResponse(request, error.code, 400, error.message);
    if (error instanceof SettlementError) {
      const status = error.code === "ORDER_NOT_FOUND" ? 404 : 409;
      return errorResponse(request, error.code, status, error.message, error.details);
    }
    return errorResponse(request, "SETTLEMENT_TEMPORARILY_UNAVAILABLE", 503, "Settlement is temporarily unavailable.");
  }
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getSettlementContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  const { orderId: rawOrderId } = await context.params;
  const orderId = parseOrderId(rawOrderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const order = await auth.orderRepository.findByIdForUser(orderId, auth.userId);
  if (!order) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const payments = await auth.paymentRepository.findByOrderForUser(orderId, auth.userId);
  return NextResponse.json(
    { items: payments.map(toPaymentDto) },
    { headers: privateHeaders(request) },
  );
}

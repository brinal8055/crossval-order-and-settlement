import { NextResponse } from "next/server";
import { z } from "zod";

import { DomainError } from "@/domain/errors";
import { isSameOrigin } from "@/server/auth/security";
import { getOrderContext } from "@/server/orders/http";
import {
  deleteOrder,
  parseOrderId,
  patchOrder,
  toOrderDto,
} from "@/server/orders/service";
import { errorBody, privateHeaders, validationDetails } from "@/server/http/request";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPrice: z.string().trim().min(1),
}).strict();

const patchOrderSchema = z.object({
  version: z.number().int().min(1),
  customer: z.string().trim().min(1).max(200).optional(),
  dueDate: z.string().optional(),
  lines: z.array(lineSchema).min(1).max(100).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "version"), {
  message: "At least one mutable field is required.",
});

function errorResponse(
  request: Request,
  code: string,
  status: number,
  message = code,
  details?: Record<string, string>,
) {
  return NextResponse.json(errorBody(request, code, message, details), { status, headers: privateHeaders(request) });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getOrderContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  const { orderId: rawOrderId } = await context.params;
  const orderId = parseOrderId(rawOrderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const order = await auth.orderRepository.findByIdForUser(orderId, auth.userId);
  if (!order) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  return NextResponse.json(toOrderDto(order), {
    headers: privateHeaders(request),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getOrderContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  if (!isSameOrigin(request.headers.get("origin"), auth.environment.APP_ORIGIN)) {
    return errorResponse(request, "ORIGIN_MISMATCH", 403);
  }
  const { orderId: rawOrderId } = await context.params;
  const orderId = parseOrderId(rawOrderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const parsed = patchOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      request,
      "VALIDATION_ERROR",
      400,
      "Check the highlighted order fields.",
      validationDetails(parsed.error.issues),
    );
  }

  try {
    const result = await patchOrder(
      auth.userId,
      orderId,
      parsed.data,
      auth.orderRepository,
    );
    if ("failure" in result) {
      const status = result.failure === "ORDER_VERSION_CONFLICT" ? 409 : result.failure === "ORDER_LOCKED_AFTER_PAYMENT" ? 409 : 404;
      return errorResponse(request, result.failure, status);
    }
    return NextResponse.json(toOrderDto(result.order), {
      headers: privateHeaders(request),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return errorResponse(request, error.code, 400, error.message);
    }
    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await getOrderContext(request);
  if (!auth.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  if (!isSameOrigin(request.headers.get("origin"), auth.environment.APP_ORIGIN)) {
    return errorResponse(request, "ORIGIN_MISMATCH", 403);
  }
  const { orderId: rawOrderId } = await context.params;
  const orderId = parseOrderId(rawOrderId);
  if (!orderId) return errorResponse(request, "ORDER_NOT_FOUND", 404);
  const version = Number(new URL(request.url).searchParams.get("version"));
  if (!Number.isInteger(version) || version < 1) return errorResponse(request, "VALIDATION_ERROR", 400);

  const result = await deleteOrder(auth.userId, orderId, version, auth.orderRepository);
  if ("failure" in result) {
    const status = result.failure === "ORDER_NOT_FOUND" ? 404 : 409;
    return errorResponse(request, result.failure, status);
  }
  return new NextResponse(null, {
    status: 204,
    headers: privateHeaders(request),
  });
}

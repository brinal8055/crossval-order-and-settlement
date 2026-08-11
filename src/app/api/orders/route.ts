import { NextResponse } from "next/server";
import { z } from "zod";

import { DomainError } from "@/domain/errors";
import { formatMoney } from "@/domain/money";
import { isSameOrigin } from "@/server/auth/security";
import { parseOrderStatus, toOrderDto, createOrder } from "@/server/orders/service";
import { getOrderContext } from "@/server/orders/http";
import { errorBody, privateHeaders, validationDetails } from "@/server/http/request";

export const runtime = "nodejs";

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPrice: z.string().trim().min(1),
}).strict();

const createOrderSchema = z.object({
  customer: z.string().trim().min(1).max(200),
  dueDate: z.string(),
  lines: z.array(lineSchema).min(1).max(100),
}).strict();

function errorResponse(
  request: Request,
  code: string,
  status: number,
  message = code,
  details?: Record<string, string>,
) {
  return NextResponse.json(errorBody(request, code, message, details), { status, headers: privateHeaders(request) });
}

export async function POST(request: Request) {
  const context = await getOrderContext(request);
  if (!context.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  if (!isSameOrigin(request.headers.get("origin"), context.environment.APP_ORIGIN)) {
    return errorResponse(request, "ORIGIN_MISMATCH", 403);
  }
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
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
    const order = await createOrder(
      context.userId,
      parsed.data,
      context.orderRepository,
    );
    return NextResponse.json(
      toOrderDto(order),
      { status: 201, headers: privateHeaders(request) },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return errorResponse(request, error.code, 400, error.message);
    }
    throw error;
  }
}

export async function GET(request: Request) {
  const context = await getOrderContext(request);
  if (!context.userId) return errorResponse(request, "UNAUTHENTICATED", 401);
  const url = new URL(request.url);
  const statusValue = url.searchParams.get("status");
  const status = parseOrderStatus(statusValue);
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "25");
  if (
    (statusValue !== null && !status) ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return errorResponse(request, "VALIDATION_ERROR", 400);
  }

  const result = await context.orderRepository.listForUser({
    userId: context.userId,
    today: new Date().toISOString().slice(0, 10),
    status,
    skip: (page - 1) * limit,
    limit,
  });
  return NextResponse.json(
    {
      items: result.orders.map((order) => toOrderDto(order)),
      pagination: { page, limit, total: result.total },
      summary: {
        outstanding: formatMoney(result.summary.outstandingCents),
        overdue: result.summary.overdueCount,
        partiallyPaid: result.summary.partiallyPaidCount,
        paid: result.summary.paidCount,
      },
    },
    { headers: privateHeaders(request) },
  );
}

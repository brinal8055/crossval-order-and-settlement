import { NextResponse } from "next/server";

import { assertValidBusinessDate, formatUtcDate } from "@/domain/dates";
import { toOrderDto } from "@/server/orders/service";
import { getOrderContext } from "@/server/orders/http";
import { ordersToCsv } from "@/server/orders/csv";
import { errorBody, privateHeaders } from "@/server/http/request";

export const runtime = "nodejs";

function errorResponse(request: Request, message: string, details?: Record<string, string>) {
  return NextResponse.json(errorBody(request, "VALIDATION_ERROR", message, details), {
    status: 400,
    headers: privateHeaders(request),
  });
}

function dateRange(value: string, field: string): Date {
  try {
    assertValidBusinessDate(value);
  } catch {
    throw new Error(`${field} must be a valid YYYY-MM-DD date.`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export async function GET(request: Request) {
  const context = await getOrderContext(request);
  if (!context.userId) {
    return NextResponse.json(errorBody(request, "UNAUTHENTICATED"), {
      status: 401,
      headers: privateHeaders(request),
    });
  }

  const params = new URL(request.url).searchParams;
  const fromValue = params.get("from");
  const toValue = params.get("to");
  if (!fromValue || !toValue) {
    return errorResponse(request, "Export requires both from and to dates.", {
      from: "Use YYYY-MM-DD.",
      to: "Use YYYY-MM-DD.",
    });
  }

  try {
    const from = dateRange(fromValue, "from");
    const to = dateRange(toValue, "to");
    if (from > to) return errorResponse(request, "The from date must not be after the to date.");
    const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    const orders = await context.orderRepository.exportForUser({
      userId: context.userId,
      from,
      toExclusive,
    });
    const csv = ordersToCsv(orders.map((order) => toOrderDto(order)));
    return new NextResponse(csv, {
      status: 200,
      headers: privateHeaders(request, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="orders-${formatUtcDate(from)}-to-${formatUtcDate(to)}.csv"`,
      }),
    });
  } catch (error) {
    if (error instanceof Error) return errorResponse(request, error.message);
    return errorResponse(request, "The export dates are invalid.");
  }
}

import { NextResponse } from "next/server";

import { authenticateRequest } from "@/server/auth/http";
import { errorBody, privateHeaders } from "@/server/http/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user } = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json(errorBody(request, "UNAUTHENTICATED", "Authentication is required."), { status: 401, headers: privateHeaders(request) });
  }
  return NextResponse.json({ user }, { headers: privateHeaders(request) });
}

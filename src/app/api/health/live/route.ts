import { NextResponse } from "next/server";

import { privateHeaders } from "@/server/http/request";

export const runtime = "nodejs";

export function GET(request: Request) {
  return NextResponse.json({ status: "ok" }, { headers: privateHeaders(request) });
}

import { NextResponse } from "next/server";

import { connectMongo } from "@/server/db/client";
import { readEnvironment } from "@/server/config/env";
import { privateHeaders } from "@/server/http/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const environment = readEnvironment();
    const client = await connectMongo(environment.MONGODB_URI);
    await client.db(environment.MONGODB_DATABASE).command({ ping: 1 });
    return NextResponse.json({ status: "ready" }, { headers: privateHeaders(request) });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_READY", message: "Service dependencies are unavailable.", requestId: privateHeaders(request)["X-Request-Id"] } },
      { status: 503, headers: privateHeaders(request) },
    );
  }
}

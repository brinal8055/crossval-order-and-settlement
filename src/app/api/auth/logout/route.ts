import { NextResponse } from "next/server";

import { getAuthContext } from "@/server/auth/http";
import { isSameOrigin } from "@/server/auth/security";
import { logout } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { errorBody, privateHeaders } from "@/server/http/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!isSameOrigin(request.headers.get("origin"), context.environment.APP_ORIGIN)) {
    return NextResponse.json(errorBody(request, "ORIGIN_MISMATCH", "Request origin is not allowed."), { status: 403, headers: privateHeaders(request) });
  }

  const token = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  await logout(token, context.repositories);
  const response = NextResponse.json(null, { headers: privateHeaders(request) });
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: context.environment.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

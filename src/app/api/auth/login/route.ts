import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthContext } from "@/server/auth/http";
import { isSameOrigin } from "@/server/auth/security";
import { readEnvironment } from "@/server/config/env";
import { sessionCookieOptions, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { login } from "@/server/auth/service";
import { errorBody, privateHeaders, validationDetails } from "@/server/http/request";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
}).strict();

export async function POST(request: Request) {
  const environment = readEnvironment();
  if (!isSameOrigin(request.headers.get("origin"), environment.APP_ORIGIN)) {
    return NextResponse.json(errorBody(request, "ORIGIN_MISMATCH", "Request origin is not allowed."), { status: 403, headers: privateHeaders(request) });
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(errorBody(request, "INVALID_CREDENTIALS", "Enter a valid email and password.", validationDetails(parsed.error.issues)), { status: 401, headers: privateHeaders(request) });
  }

  const context = await getAuthContext();
  const result = await login(
    parsed.data.email,
    parsed.data.password,
    context.repositories,
    context.environment,
    new Date(),
  );
  if (!result) {
    return NextResponse.json(errorBody(request, "INVALID_CREDENTIALS", "Invalid email or password."), { status: 401, headers: privateHeaders(request) });
  }

  const response = NextResponse.json({ user: result.user }, { headers: privateHeaders(request) });
  response.cookies.set(SESSION_COOKIE_NAME, result.token, sessionCookieOptions(context.environment.NODE_ENV, context.environment.SESSION_TTL_SECONDS));
  return response;
}

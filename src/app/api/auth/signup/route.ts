import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthContext } from "@/server/auth/http";
import { isSameOrigin } from "@/server/auth/security";
import { readEnvironment } from "@/server/config/env";
import { sessionCookieOptions, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { normalizeEmail, signup } from "@/server/auth/service";
import { errorBody, privateHeaders, validationDetails } from "@/server/http/request";

export const runtime = "nodejs";

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
}).strict();

export async function POST(request: Request) {
  const environment = readEnvironment();
  if (!isSameOrigin(request.headers.get("origin"), environment.APP_ORIGIN)) {
    return NextResponse.json(errorBody(request, "ORIGIN_MISMATCH", "Request origin is not allowed."), { status: 403, headers: privateHeaders(request) });
  }
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(errorBody(request, "INVALID_REQUEST", "Check the highlighted account fields.", validationDetails(parsed.error.issues)), { status: 400, headers: privateHeaders(request) });
  }

  const context = await getAuthContext();
  try {
    const result = await signup(
      parsed.data.email,
      parsed.data.password,
      context.repositories,
      context.environment,
      new Date(),
    );
    const response = NextResponse.json({ user: result.user }, { status: 201, headers: privateHeaders(request) });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, sessionCookieOptions(context.environment.NODE_ENV, context.environment.SESSION_TTL_SECONDS));
    return response;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json(errorBody(request, "EMAIL_ALREADY_REGISTERED", "That email is already registered.", { email: normalizeEmail(parsed.data.email) }), { status: 409, headers: privateHeaders(request) });
    }
    throw error;
  }
}

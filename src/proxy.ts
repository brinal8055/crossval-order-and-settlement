import { NextResponse, type NextRequest } from "next/server";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function proxy(request: NextRequest) {
  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && /^[a-zA-Z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-Id", requestId);
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
}

export const config = { matcher: "/:path*" };

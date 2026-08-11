import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";
const requestIds = new WeakMap<Request, string>();

export function requestId(request: Request): string {
  const cached = requestIds.get(request);
  if (cached) return cached;
  const supplied = request.headers.get(REQUEST_ID_HEADER);
  const value = supplied && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  requestIds.set(request, value);
  return value;
}

export function privateHeaders(request: Request, extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId(request),
    ...extra,
  };
}

export function errorBody(request: Request, code: string, message = code, details?: Record<string, string>) {
  return {
    error: {
      code,
      message,
      requestId: requestId(request),
      ...(details ? { details } : {}),
    },
  };
}

export function validationDetails(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  return issues.reduce<Record<string, string>>((details, issue) => {
    const field = issue.path.length > 0 ? issue.path.map(String).join(".") : "request";
    details[field] ??= issue.message;
    return details;
  }, {});
}

import { describe, expect, it } from "vitest";

import { GET as liveGet } from "@/app/api/health/live/route";
import { GET as readyGet } from "@/app/api/health/ready/route";
import { errorBody, privateHeaders, requestId } from "@/server/http/request";

describe("operability HTTP boundary", () => {
  it("keeps liveness independent from MongoDB", async () => {
    const response = liveGet(new Request("http://localhost/api/health/live"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("fails readiness safely when required environment/dependencies are unavailable", async () => {
    const response = await readyGet(new Request("http://localhost/api/health/ready"));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_READY");
    expect(body.error.message).not.toContain("mongodb://");
  });

  it("uses a safe supplied request id and includes it in error DTOs", () => {
    const request = new Request("http://localhost/api/orders", { headers: { "x-request-id": "trace-123" } });
    expect(requestId(request)).toBe("trace-123");
    expect(privateHeaders(request)["X-Request-Id"]).toBe("trace-123");
    expect(errorBody(request, "ORDER_NOT_FOUND").error.requestId).toBe("trace-123");
    expect(requestId(new Request("http://localhost"))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

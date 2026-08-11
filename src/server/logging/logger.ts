import pino from "pino";

export const logger = pino({
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "tokenHash",
      "cookie",
      "cookies",
      "authorization",
      "headers.cookie",
      "headers.authorization",
      "note",
    ],
    censor: "[REDACTED]",
  },
});

export function logRequest(requestId: string, method: string, route: string, statusCode: number, durationMs: number) {
  logger.info({ requestId, method, route, statusCode, durationMs }, "request completed");
}

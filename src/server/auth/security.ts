function effectivePort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === "https:") return "443";
  if (url.protocol === "http:") return "80";
  return "";
}

export function isSameOrigin(actualOrigin: string | null, expectedOrigin: string): boolean {
  if (!actualOrigin) return false;

  try {
    const actual = new URL(actualOrigin);
    const expected = new URL(expectedOrigin);
    return (
      actual.protocol === expected.protocol &&
      actual.hostname === expected.hostname &&
      effectivePort(actual) === effectivePort(expected)
    );
  } catch {
    return false;
  }
}

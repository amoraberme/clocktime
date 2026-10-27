/** Only allow same-site relative paths (blocks open redirects like //evil.com or https://evil.com). */
export function safeNext(next: string | null | undefined, fallback = "/home") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

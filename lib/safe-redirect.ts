const DEFAULT_CALLBACK_URL = "/dashboard";

/**
 * Only same-origin absolute-path redirects are accepted.
 *
 * Auth.js validates the `callbackUrl` it handles itself, but the credentials
 * flow navigates with `window.location.href` after a successful sign-in, so
 * this is the only guard on that path. Anything that is not an internal path
 * (`javascript:`, `https://evil.tld`, protocol-relative `//evil.tld`, the
 * browser-normalized `/\evil.tld`, control characters, backslashes) falls back
 * to the dashboard.
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback = DEFAULT_CALLBACK_URL
): string {
  if (typeof raw !== "string") return fallback;

  const value = raw.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Control characters and backslashes can be normalized into a different URL
  // by the browser (e.g. "/\evil.tld" -> "https://evil.tld/").
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;

  try {
    const base = "https://splitmate.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("/") ? path : fallback;
  } catch {
    return fallback;
  }
}

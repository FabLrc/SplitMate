/**
 * Push services this app is allowed to send notifications to.
 *
 * `web-push` performs a server-side POST to whatever endpoint is stored, and
 * the endpoint comes from the browser, so an unrestricted value is a blind
 * SSRF primitive. Only the four real vendor push services are accepted, over
 * HTTPS on the default port, with no embedded credentials.
 */
const ALLOWED_HOSTS: Record<string, true> = {
  "fcm.googleapis.com": true, // Chrome / Edge (Chromium)
  "updates.push.services.mozilla.com": true, // Firefox
  "web.push.apple.com": true, // Safari
};

const ALLOWED_HOST_SUFFIXES = [
  ".notify.windows.com", // Edge (legacy WNS)
];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port !== "" && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();
  if (Object.hasOwn(ALLOWED_HOSTS, host)) return true;
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length
  );
}

import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of the Vercel cron bearer token.
 *
 * Fails closed when `CRON_SECRET` is unset: the previous `undefined`
 * interpolation made the expected header the literal string
 * "Bearer undefined", which anyone could send.
 */
export function isAuthorizedCron(
  authorizationHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  if (!authorizationHeader) return false;

  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(authorizationHeader, "utf8");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

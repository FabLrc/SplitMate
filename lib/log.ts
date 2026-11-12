/**
 * Log an unexpected server failure without its payload.
 *
 * Prisma errors embed query arguments (expense labels, amounts, emails), so
 * logging the raw error object leaks user data into platform logs. Only the
 * error class and stable code are kept for triage.
 */
export function logServerError(scope: string, error: unknown): void {
  let code: unknown;
  if (error && typeof error === "object" && "code" in error) {
    code = error.code;
  }

  console.error("[server]", {
    scope,
    name: error instanceof Error ? error.name : typeof error,
    ...(typeof code === "string" ? { code } : {}),
  });
}

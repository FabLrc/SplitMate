import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const CSP_ENABLED = process.env.NODE_ENV === "production";

/**
 * Per-request nonce-based CSP. Next.js reads the `nonce-...` value from the
 * request's CSP header and applies it to its own inline bootstrap scripts; the
 * two inline scripts in app/layout.tsx read the same value from `x-nonce`.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // Radix and Next inject inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    // OAuth avatars come from arbitrary provider CDNs.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = CSP_ENABLED ? contentSecurityPolicy(nonce) : null;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Never trust a client-supplied CSP: overwrite it when the policy is active.
  if (csp) requestHeaders.set("Content-Security-Policy", csp);

  const protectedRoutes = ["/dashboard", "/sessions", "/households"];
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtected && !isLoggedIn) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    const redirect = NextResponse.redirect(signInUrl);
    if (csp) redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
});

export const config = {
  matcher: [
    {
      // Everything except API routes and immutable static assets. Prefetches
      // are skipped: the CSP is applied when the page is actually rendered.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

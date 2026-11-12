import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email";
import type { Provider } from "next-auth/providers";

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_ATTEMPTS_PER_EMAIL = 10;
const LOGIN_ATTEMPTS_PER_IP = 20;

// bcrypt hash of an unused password. Comparing against it when the account
// does not exist keeps response time constant, so login cannot be used to
// enumerate registered emails.
const DUMMY_PASSWORD_HASH =
  "$2b$12$ZssyxeoAHBU0BMYm769Euui7YW4kAwvgzDFQbDrX3YeHgXFZHO2QW";

function readStringClaim(profile: unknown, claim: string): string {
  if (!profile || typeof profile !== "object" || !(claim in profile)) return "";
  const value = Reflect.get(profile, claim);
  return typeof value === "string" ? value : "";
}

function readBooleanClaim(profile: unknown, claim: string): boolean | undefined {
  if (!profile || typeof profile !== "object" || !(claim in profile)) {
    return undefined;
  }
  const value = Reflect.get(profile, claim);
  return typeof value === "boolean" ? value : undefined;
}

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    checks: ["state"],
    // A verified Google email proves mailbox ownership. The signIn callback
    // below decides whether auto-linking is safe: it revokes an unverified
    // password credential that squatted the address, so an attacker cannot
    // pre-register a victim's email and lock them out.
    allowDangerousEmailAccountLinking: true,
  }),
  Discord({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    checks: ["state"],
    // Discord returns iss=https://discord.com in the OAuth callback. Auth.js
    // validates it against the provider issuer and falls back to
    // https://authjs.dev when unset, which makes every login fail with
    // OAUTH_INVALID_RESPONSE.
    issuer: "https://discord.com",
    // Both Discord and Google verify the email, so an OAuth-only account can
    // safely be matched by email. The signIn callback below neutralizes
    // automatic linking for password accounts.
    allowDangerousEmailAccountLinking: true,
  }),
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Mot de passe", type: "password" },
    },
    async authorize(credentials, request) {
      const email =
        typeof credentials?.email === "string"
          ? normalizeEmail(credentials.email)
          : "";
      const password =
        typeof credentials?.password === "string" ? credentials.password : "";
      if (!email || !password) return null;

      // Per-instance throttling: bcrypt slows an attacker down, but without a
      // cap a single instance can still be ground through. Counters are keyed
      // by email and by client IP, and reset after a successful login.
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const emailLimit = rateLimit(
        `login:email:${email}`,
        LOGIN_ATTEMPTS_PER_EMAIL,
        LOGIN_WINDOW_MS
      );
      const ipLimit = rateLimit(
        `login:ip:${ip}`,
        LOGIN_ATTEMPTS_PER_IP,
        LOGIN_WINDOW_MS
      );
      if (!emailLimit.ok || !ipLimit.ok) return null;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      const isValid = await bcrypt.compare(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH
      );

      if (!user || !user.passwordHash || !isValid) return null;

      resetRateLimit(`login:email:${email}`);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

// Auth.js does not re-export LoggerInstance from next-auth; the config
// accepts Partial<LoggerInstance> from @auth/core.
const logger: NonNullable<NextAuthConfig["logger"]> = {
  error(error) {
    // Never log tokens or secrets: Auth.js errors only carry the failure cause.
    console.error("[auth]", error);
  },
  warn(code) {
    console.warn("[auth]", code);
  },
  debug(message, metadata) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[auth]", message, metadata ?? "");
    }
  },
};

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers,
  // Vercel is the only expected production host. Elsewhere the Host header is
  // only trusted for local development; self-hosting must set AUTH_URL.
  trustHost: process.env.VERCEL === "1" || process.env.NODE_ENV !== "production",
  useSecureCookies: process.env.NODE_ENV === "production",
  logger,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    newUser: "/dashboard",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.provider === "credentials") return true;

      // Only providers that verify mailbox ownership may match an account by
      // email (Google: `email_verified`, Discord: `verified`).
      const email = normalizeEmail(readStringClaim(profile, "email"));
      const emailVerified =
        account.provider === "google"
          ? readBooleanClaim(profile, "email_verified") !== false
          : account.provider === "discord"
            ? readBooleanClaim(profile, "verified") === true
            : false;

      if (!email || !emailVerified) {
        return account.provider === "discord"
          ? "/auth/signin?error=DiscordEmailUnverified"
          : "/auth/signin?error=OAuthEmailUnverified";
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      });
      if (!existingUser?.passwordHash) return true;

      // Explicit linking from the dashboard: the session already belongs to
      // the same user, so no takeover is possible.
      const currentSession = await auth();
      if (currentSession?.user?.id === existingUser.id) return true;

      // The provider just proved control of this mailbox. A password
      // credential created without email verification must not keep
      // ownership of it, otherwise registering a victim's address first
      // locks the victim out of their own account for good.
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash: null },
      });
      return true;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

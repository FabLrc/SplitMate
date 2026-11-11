import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Provider } from "next-auth/providers";

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    checks: ["state"],
  }),
  Discord({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    checks: ["state"],
    // Only for Discord: both Discord and Google verify the email, so an
    // OAuth-only account can safely be matched by email. The signIn callback
    // below neutralizes automatic linking for password accounts.
    allowDangerousEmailAccountLinking: true,
  }),
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Mot de passe", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      const user = await prisma.user.findUnique({
        where: { email: credentials.email as string },
      });

      if (!user || !user.passwordHash) return null;

      const isValid = await bcrypt.compare(
        credentials.password as string,
        user.passwordHash
      );

      if (!isValid) return null;

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
  trustHost: true,
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
      if (account?.provider === "discord") {
        // User.email is required in the schema: reject Discord accounts
        // without a verified email instead of crashing in createUser.
        if (!profile?.email || profile.verified !== true) {
          return "/auth/signin?error=DiscordEmailUnverified";
        }

        // allowDangerousEmailAccountLinking above lets Auth.js link Discord to
        // an existing user by email without an active session. Never allow
        // that for a credentials account: its email was never verified, so it
        // could be an account takeover.
        const existingUser = await prisma.user.findUnique({
          where: { email: profile.email },
          select: { id: true, passwordHash: true },
        });

        if (existingUser?.passwordHash) {
          // Explicit linking from the dashboard: the session already belongs
          // to the same user, so no takeover is possible.
          const currentSession = await auth();
          if (currentSession?.user?.id !== existingUser.id) {
            return "/auth/signin?error=OAuthAccountNotLinked";
          }
        }
      }
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

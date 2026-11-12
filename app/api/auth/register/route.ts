import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { normalizeEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logServerError } from "@/lib/log";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  // bcrypt only reads the first 72 bytes; longer input must not be accepted
  // silently.
  password: z.string().min(8).max(72),
});

export async function POST(req: NextRequest) {
  const limit = rateLimit(
    `register:${clientIp(req.headers)}`,
    5,
    10 * 60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const { name, email, password } = registerSchema.parse(body);
    const normalizedEmail = normalizeEmail(email);

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      // Same body, status and timing as the create path: hashing burns the
      // same bcrypt cost, so neither content nor latency discloses whether an
      // address already has an account.
      await bcrypt.hash(password, 12);
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: { name, email: normalizedEmail, passwordHash },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides.", issues: error.issues },
        { status: 400 }
      );
    }
    // Simultaneous signups for the same address: the other request won the
    // unique constraint, answer exactly like a normal signup.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    logServerError("register", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

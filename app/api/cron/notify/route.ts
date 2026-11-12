import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { isAuthorizedCron } from "@/lib/cron-auth";

/**
 * Single daily cron (runs at 10 AM Paris time via Vercel Cron).
 * Handles:
 *   1. Session reminders every 2 days for OPEN sessions
 *   2. Monthly reminder on the 1st of each month
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: without a secret the old check accepted the literal
    // "Bearer undefined", letting anyone trigger mass push notifications.
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }
  if (!isAuthorizedCron(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  let sessionReminders = 0;
  let monthlyReminders = 0;

  // --- 1. Session reminders (every 2 days) ---
  // Find OPEN sessions where last notification (or creation) was >= 2 days ago
  const dueSessions = await prisma.expenseSession.findMany({
    where: {
      status: "OPEN",
      OR: [
        { lastNotifiedAt: null, createdAt: { lte: twoDaysAgo } },
        { lastNotifiedAt: { lte: twoDaysAgo } },
      ],
    },
    select: {
      id: true,
      title: true,
      creatorId: true,
      inviteeId: true,
      creator: { select: { name: true } },
      invitee: { select: { name: true } },
    },
  });

  for (const session of dueSessions) {
    const userIds = [session.creatorId, session.inviteeId].filter(Boolean) as string[];

    for (const userId of userIds) {
      const partnerName =
        userId === session.creatorId
          ? (session.invitee?.name ?? "votre partenaire")
          : (session.creator.name ?? "votre partenaire");

      try {
        await sendPushToUser(userId, {
          title: "SplitMate",
          body: `Vous avez des depenses en cours dans "${session.title}" avec ${partnerName}. Pensez a les mettre a jour !`,
          url: `/sessions/${session.id}`,
        });
        sessionReminders++;
      } catch {
        // Individual send failures are non-blocking
      }
    }

    // Mark session as notified
    await prisma.expenseSession.update({
      where: { id: session.id },
      data: { lastNotifiedAt: now },
    });
  }

  // --- 2. Monthly reminder (1st of the month) ---
  // Check current date in Paris timezone
  const parisDate = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  if (parisDate.getDate() === 1) {
    const monthName = now.toLocaleDateString("fr-FR", {
      month: "long",
      timeZone: "Europe/Paris",
    });

    // Find all users who have at least one OPEN session
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { createdExpSessions: { some: { status: "OPEN" } } },
          { invitedExpSessions: { some: { status: "OPEN" } } },
        ],
      },
      select: { id: true },
    });

    for (const user of users) {
      try {
        await sendPushToUser(user.id, {
          title: "SplitMate",
          body: `Pensez a faire vos comptes de ${monthName} !`,
          url: "/dashboard",
        });
        monthlyReminders++;
      } catch {
        // Individual send failures are non-fetch errors
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sessionReminders,
    monthlyReminders,
    sessionsProcessed: dueSessions.length,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractText } from "unpdf";
import {
  MAX_STATEMENT_BYTES,
  StatementImportError,
  decodeStatementBytes,
  detectStatementKind,
  markDuplicates,
  requestStatementAnalysis,
  truncateStatementText,
} from "@/lib/statement-import";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSession = await auth();
  const userId = authSession?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "Non authentifié." },
      { status: 401, headers: NO_STORE }
    );
  }

  const expSession = await prisma.expenseSession.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      currency: true,
      defaultSplitRatio: true,
      creatorId: true,
      inviteeId: true,
      status: true,
      expenses: { select: { label: true, amount: true, date: true } },
    },
  });

  if (!expSession) {
    return NextResponse.json(
      { error: "Session introuvable." },
      { status: 404, headers: NO_STORE }
    );
  }

  const isMember =
    expSession.creatorId === userId || expSession.inviteeId === userId;
  if (!isMember) {
    return NextResponse.json(
      { error: "Accès refusé." },
      { status: 403, headers: NO_STORE }
    );
  }

  if (expSession.status === "CLOSED") {
    return NextResponse.json(
      { error: "La session est fermée." },
      { status: 400, headers: NO_STORE }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Requête invalide : fichier manquant." },
      { status: 400, headers: NO_STORE }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Aucun fichier reçu." },
      { status: 400, headers: NO_STORE }
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "Le fichier est vide." },
      { status: 400, headers: NO_STORE }
    );
  }

  if (file.size > MAX_STATEMENT_BYTES) {
    return NextResponse.json(
      { error: "Le fichier dépasse la taille maximale de 4 Mo." },
      { status: 413, headers: NO_STORE }
    );
  }

  const kind = detectStatementKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      {
        error:
          "Format non pris en charge. Utilisez un fichier PDF, CSV ou TXT.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  let rawText: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === "pdf") {
      const extracted = await extractText(bytes, { mergePages: true });
      rawText = extracted.text;
    } else {
      rawText = decodeStatementBytes(bytes);
    }
  } catch {
    return NextResponse.json(
      {
        error:
          kind === "pdf"
            ? "Impossible de lire ce PDF. Vérifiez qu'il n'est pas protégé par un mot de passe."
            : "Impossible de lire ce fichier.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const prepared = truncateStatementText(rawText);
  if (!prepared.text) {
    return NextResponse.json(
      { error: "Aucun texte exploitable n'a été trouvé dans ce fichier." },
      { status: 422, headers: NO_STORE }
    );
  }

  try {
    // Classification history: the 10 most recent other sessions the user takes
    // part in, capped at 30 expenses each.
    const historySessions = await prisma.expenseSession.findMany({
      where: {
        id: { not: id },
        OR: [{ creatorId: userId }, { inviteeId: userId }],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        title: true,
        currency: true,
        defaultSplitRatio: true,
        expenses: {
          select: { label: true, amount: true, isShared: true },
          orderBy: { date: "desc" },
          take: 30,
        },
      },
    });

    const { suggestions, model } = await requestStatementAnalysis(
      prepared.text,
      {
        title: expSession.title,
        currency: expSession.currency,
        defaultSplitRatio: expSession.defaultSplitRatio,
        history: historySessions,
      }
    );

    return NextResponse.json(
      {
        expenses: markDuplicates(suggestions, expSession.expenses),
        meta: {
          fileName: file.name,
          model,
          characters: prepared.text.length,
          truncated: prepared.truncated,
        },
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    if (error instanceof StatementImportError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE }
      );
    }
    // Never log statement content or the extracted text.
    console.error(
      "import-statement: unexpected failure",
      error instanceof Error ? error.name : "unknown error"
    );
    return NextResponse.json(
      { error: "Erreur serveur." },
      { status: 500, headers: NO_STORE }
    );
  }
}

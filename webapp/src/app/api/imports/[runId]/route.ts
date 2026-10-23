import { NextResponse } from "next/server";
import { getRun } from "@/lib/databricks";
import { erreurDatabricks } from "@/lib/http";

/** GET /api/imports/:runId → statut simplifié du run, et message d'erreur en cas d'échec. */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const id = Number(runId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ erreurs: [{ message: "Identifiant de run invalide" }] }, { status: 400 });
  }

  try {
    return NextResponse.json(await getRun(id));
  } catch (e) {
    return erreurDatabricks(e);
  }
}

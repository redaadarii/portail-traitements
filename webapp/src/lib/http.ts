import "server-only";
import { NextResponse } from "next/server";
import { DatabricksError } from "./databricks";

export function erreurServeur(message: string) {
  return NextResponse.json({ erreurs: [{ message }] }, { status: 500 });
}

/** Traduit une erreur technique en message compréhensible ; le détail part dans les logs. */
export function erreurDatabricks(e: unknown) {
  console.error("[databricks]", e);
  if (e instanceof DatabricksError) {
    const message =
      e.status === 401 || e.status === 403
        ? "L'application n'a pas les droits nécessaires sur Databricks"
        : e.status === 404
          ? "Ressource Databricks introuvable (job ou volume)"
          : e.status === 429
            ? "Databricks est momentanément saturé, réessayez dans un instant"
            : "Erreur lors de l'appel à Databricks";
    return NextResponse.json({ erreurs: [{ message }] }, { status: 502 });
  }
  return erreurServeur("Erreur inattendue");
}

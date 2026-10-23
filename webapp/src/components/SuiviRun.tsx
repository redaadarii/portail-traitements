"use client";

import { useEffect, useState } from "react";
import type { RunInfo, Statut } from "@/lib/types";

const LIBELLES: Record<Statut, { texte: string; classes: string }> = {
  EN_ATTENTE: { texte: "En attente", classes: "bg-slate-100 text-slate-700" },
  EN_COURS: { texte: "En cours", classes: "bg-blue-100 text-blue-800" },
  SUCCES: { texte: "Terminé", classes: "bg-green-100 text-green-800" },
  ECHEC: { texte: "Échec", classes: "bg-red-100 text-red-800" },
  ANNULE: { texte: "Annulé", classes: "bg-amber-100 text-amber-800" },
};

const INTERVALLE_MS = 3000;

function Badge({ statut }: { statut: Statut }) {
  const { texte, classes } = LIBELLES[statut];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>{texte}</span>;
}

/** Interroge l'API toutes les 3 s jusqu'à ce que le run soit terminé. */
export function SuiviRun({ runId }: { runId: number }) {
  const [run, setRun] = useState<RunInfo | null>(null);
  const [erreurReseau, setErreurReseau] = useState<string | null>(null);

  useEffect(() => {
    let actif = true; // évite de mettre à jour un composant démonté
    let minuteur: ReturnType<typeof setTimeout>;

    async function interroger() {
      try {
        const res = await fetch(`/api/imports/${runId}`, { cache: "no-store" });
        const json = await res.json();
        if (!actif) return;
        if (!res.ok) {
          setErreurReseau(json.erreurs?.[0]?.message ?? "Statut indisponible");
        } else {
          setErreurReseau(null);
          setRun(json);
          if (json.termine) return; // on arrête d'interroger
        }
      } catch {
        if (actif) setErreurReseau("Connexion perdue, nouvelle tentative…");
      }
      if (actif) minuteur = setTimeout(interroger, INTERVALLE_MS);
    }

    interroger();
    return () => {
      actif = false;
      clearTimeout(minuteur);
    };
  }, [runId]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Traitement n° {runId}</h2>
        {run ? <Badge statut={run.statut} /> : <span className="text-sm text-slate-500">Chargement…</span>}
      </div>

      {run && (
        <>
          <ol className="mt-4 space-y-2">
            {run.taches.map((t) => (
              <li key={t.cle} className="flex items-center justify-between text-sm">
                <span className="font-mono">{t.cle}</span>
                <Badge statut={t.statut} />
              </li>
            ))}
          </ol>

          {run.statut === "SUCCES" && (
            <p className="mt-4 text-sm text-green-800">
              Données de {run.parametres.periode} chargées avec succès.
            </p>
          )}

          {run.erreur && (
            <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">Le traitement a échoué :</p>
              <p className="mt-1 whitespace-pre-line">{run.erreur}</p>
            </div>
          )}

          {run.urlDatabricks && (
            <a
              href={run.urlDatabricks}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm text-blue-700 underline"
            >
              Voir le détail dans Databricks
            </a>
          )}
        </>
      )}

      {erreurReseau && <p className="mt-3 text-sm text-amber-700">{erreurReseau}</p>}
    </section>
  );
}

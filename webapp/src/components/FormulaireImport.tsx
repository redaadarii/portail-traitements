"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formulaireImportSchema, type ErreurValidation } from "@/lib/schemas";
import { SuiviRun } from "./SuiviRun";

function moisPrecedent(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function FormulaireImport() {
  // Valeur initiale vide : la date du jour n'est connue que dans le navigateur
  // (le rendu serveur est figé au moment du build).
  const [periode, setPeriode] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreurs, setErreurs] = useState<ErreurValidation[]>([]);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valeur par défaut calculée côté navigateur
    setPeriode((p) => p || moisPrecedent());
  }, []);

  async function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreurs([]);
    setRunId(null);

    // 1. Validation immédiate dans le navigateur (même schéma Zod que le serveur)
    const saisie = formulaireImportSchema.safeParse({ periode, fichier });
    if (!saisie.success) {
      setErreurs(saisie.error.issues.map((i) => ({ champ: String(i.path[0]), message: i.message })));
      return;
    }

    // 2. Envoi au serveur : multipart/form-data, comme un formulaire HTML classique
    const corps = new FormData();
    corps.append("periode", saisie.data.periode);
    corps.append("fichier", saisie.data.fichier);

    setEnvoiEnCours(true);
    try {
      const res = await fetch("/api/imports", { method: "POST", body: corps });
      const json = await res.json();
      if (!res.ok) {
        setErreurs(json.erreurs ?? [{ message: "Erreur inattendue" }]);
        return;
      }
      setRunId(json.runId);
    } catch {
      setErreurs([{ message: "Impossible de joindre le serveur" }]);
    } finally {
      setEnvoiEnCours(false);
    }
  }

  const erreurChamp = (champ: string) => erreurs.find((e) => e.champ === champ && e.ligne === undefined);
  const erreursFichier = erreurs.filter((e) => e.champ !== "periode" && e.champ !== "fichier");

  return (
    <div className="space-y-6">
      <form onSubmit={soumettre} noValidate className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="periode" className="block text-sm font-medium">
            Période
          </label>
          <input
            id="periode"
            type="month"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {erreurChamp("periode") && <p className="mt-1 text-sm text-red-600">{erreurChamp("periode")!.message}</p>}
        </div>

        <div>
          <label htmlFor="fichier" className="block text-sm font-medium">
            Fichier budget (.xlsx, onglet « budget »)
          </label>
          <input
            id="fichier"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium hover:file:bg-slate-200"
          />
          {erreurChamp("fichier") && <p className="mt-1 text-sm text-red-600">{erreurChamp("fichier")!.message}</p>}
        </div>

        <button
          type="submit"
          disabled={envoiEnCours}
          className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {envoiEnCours ? "Contrôle et envoi…" : "Contrôler et lancer l'import"}
        </button>
      </form>

      {erreursFichier.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-800">
            Le fichier n&apos;a pas été importé ({erreursFichier.length} problème{erreursFichier.length > 1 ? "s" : ""})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {erreursFichier.map((e, i) => (
              <li key={i}>
                {e.ligne !== undefined && <span className="font-mono font-medium">Ligne {e.ligne} · </span>}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {runId !== null && <SuiviRun runId={runId} />}
    </div>
  );
}

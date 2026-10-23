import "server-only";
import type { RunInfo, Statut } from "./types";

/**
 * Client minimal pour l'API REST Databricks.
 *
 * Authentification (dans cet ordre) :
 *  1. DATABRICKS_TOKEN                                → token personnel, pour le dev en local
 *  2. DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET → OAuth "machine à machine" ;
 *     c'est ce que Databricks Apps injecte automatiquement (étape 3)
 */

function getHost(): string {
  const raw = process.env.DATABRICKS_HOST;
  if (!raw) throw new Error("Variable d'environnement DATABRICKS_HOST manquante");
  // Dans Databricks Apps, la variable peut arriver sans "https://"
  const host = raw.startsWith("http") ? raw : `https://${raw}`;
  return host.replace(/\/+$/, "");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (process.env.DATABRICKS_TOKEN) return process.env.DATABRICKS_TOKEN;

  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Aucune authentification Databricks : définir DATABRICKS_TOKEN, ou DATABRICKS_CLIENT_ID et DATABRICKS_CLIENT_SECRET",
    );
  }

  // On réutilise le token tant qu'il lui reste plus d'une minute de validité
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;

  const res = await fetch(`${getHost()}/oidc/v1/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "all-apis" }),
    cache: "no-store",
  });
  if (!res.ok) throw new DatabricksError(res.status, "AUTH_FAILED", await res.text());

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export class DatabricksError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DatabricksError";
  }
}

/** Appel générique : ajoute le token, et transforme les erreurs HTTP en DatabricksError. */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getHost()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await getToken()}`, ...init.headers },
    cache: "no-store",
  });

  if (!res.ok) {
    // Les erreurs Databricks ont la forme { error_code, message }
    let code = "HTTP_" + res.status;
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error_code?: string; message?: string };
      code = body.error_code ?? code;
      message = body.message ?? message;
    } catch {
      /* corps vide ou non JSON */
    }
    throw new DatabricksError(res.status, code, message);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------------------------------------------------------------------------
// Files API : déposer un fichier dans un Volume Unity Catalog
// ---------------------------------------------------------------------------

export async function uploadToVolume(volumePath: string, content: ArrayBuffer): Promise<void> {
  // Chaque segment est encodé, mais les "/" sont conservés
  const encoded = volumePath.split("/").map(encodeURIComponent).join("/");
  await call(`/api/2.0/fs/files${encoded}?overwrite=true`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: content,
  });
}

// ---------------------------------------------------------------------------
// Jobs API
// ---------------------------------------------------------------------------

export async function runNow(jobId: number, params: Record<string, string>): Promise<number> {
  const res = await call<{ run_id: number }>("/api/2.2/jobs/run-now", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId, job_parameters: params }),
  });
  return res.run_id;
}

interface ApiState {
  life_cycle_state?: string;
  result_state?: string;
  state_message?: string;
}
interface ApiTask {
  run_id: number;
  task_key: string;
  attempt_number?: number;
  state?: ApiState;
}
interface ApiRun {
  run_id: number;
  state?: ApiState;
  start_time?: number;
  end_time?: number;
  run_page_url?: string;
  job_parameters?: { name: string; value?: string; default?: string }[];
  tasks?: ApiTask[];
}

function toStatut(state?: ApiState): Statut {
  switch (state?.life_cycle_state) {
    case "PENDING":
    case "QUEUED":
    case "BLOCKED":
    case "WAITING_FOR_RETRY":
      return "EN_ATTENTE";
    case "RUNNING":
    case "TERMINATING":
      return "EN_COURS";
    case "TERMINATED":
      if (state.result_state === "SUCCESS") return "SUCCES";
      if (state.result_state === "CANCELED") return "ANNULE";
      return "ECHEC";
    case "SKIPPED":
      return "ANNULE";
    case "INTERNAL_ERROR":
      return "ECHEC";
    default:
      return "EN_ATTENTE";
  }
}

export async function getRun(runId: number): Promise<RunInfo> {
  const run = await call<ApiRun>(`/api/2.2/jobs/runs/get?run_id=${runId}`);
  const statut = toStatut(run.state);

  // Avec les relances, une même tâche peut apparaître plusieurs fois :
  // on ne garde que sa dernière tentative.
  const derniereTentative = new Map<string, ApiTask>();
  for (const t of run.tasks ?? []) {
    const prev = derniereTentative.get(t.task_key);
    if (!prev || (t.attempt_number ?? 0) >= (prev.attempt_number ?? 0)) {
      derniereTentative.set(t.task_key, t);
    }
  }
  const taches = [...derniereTentative.values()];

  let erreur: string | null = null;
  if (statut === "ECHEC") {
    const enEchec = taches.find((t) => toStatut(t.state) === "ECHEC");
    erreur = enEchec
      ? await getTaskError(enEchec.run_id)
      : (run.state?.state_message ?? "Le traitement a échoué");
  }

  return {
    runId: run.run_id,
    statut,
    termine: statut === "SUCCES" || statut === "ECHEC" || statut === "ANNULE",
    debut: run.start_time || null,
    fin: run.end_time || null,
    urlDatabricks: run.run_page_url ?? null,
    parametres: Object.fromEntries(
      (run.job_parameters ?? []).map((p) => [p.name, p.value ?? p.default ?? ""]),
    ),
    taches: taches.map((t) => ({ cle: t.task_key, statut: toStatut(t.state) })),
    erreur,
  };
}

/** Le message d'erreur détaillé est porté par le run de la *tâche*, pas par celui du job. */
async function getTaskError(taskRunId: number): Promise<string> {
  const out = await call<{ error?: string; metadata?: { state?: ApiState } }>(
    `/api/2.2/jobs/runs/get-output?run_id=${taskRunId}`,
  );
  const brut = out.error ?? out.metadata?.state?.state_message ?? "Le traitement a échoué";
  // "ValueError: 3 erreur(s)…" → "3 erreur(s)…"
  return brut.replace(/^[A-Za-z]+Error:\s*/, "");
}

import { NextResponse } from "next/server";
import { runNow, uploadToVolume } from "@/lib/databricks";
import { erreurDatabricks, erreurServeur } from "@/lib/http";
import { lireEtValiderBudget } from "@/lib/excel";
import { formulaireImportSchema, type ErreurValidation } from "@/lib/schemas";

/**
 * POST /api/imports
 * Reçoit la période + le fichier, valide tout, dépose le fichier dans le Volume,
 * puis déclenche le job. Répond 202 avec le run_id (le traitement continue en arrière-plan).
 */
export async function POST(request: Request) {
  const jobId = Number(process.env.DATABRICKS_JOB_ID);
  const volume = process.env.VOLUME_PATH; // ex. /Volumes/workspace/portail/fichiers
  if (!jobId || !volume) {
    return erreurServeur("Configuration incomplète : DATABRICKS_JOB_ID ou VOLUME_PATH manquant");
  }

  // 1. Contrôle du formulaire (même schéma que dans le navigateur)
  const form = await request.formData();
  const saisie = formulaireImportSchema.safeParse({
    periode: form.get("periode"),
    fichier: form.get("fichier"),
  });
  if (!saisie.success) {
    const erreurs: ErreurValidation[] = saisie.error.issues.map((i) => ({
      champ: String(i.path[0]),
      message: i.message,
    }));
    return NextResponse.json({ erreurs }, { status: 400 });
  }
  const { periode, fichier } = saisie.data;

  // 2. Contrôle du contenu de l'Excel, AVANT de lancer quoi que ce soit
  const contenu = await fichier.arrayBuffer();
  const { lignes, erreurs } = await lireEtValiderBudget(contenu, periode);
  if (erreurs.length) {
    return NextResponse.json({ erreurs }, { status: 422 });
  }

  try {
    // 3. Dépôt dans le Volume, sous un nom unique (on garde un historique des fichiers)
    const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
    const nomPropre = fichier.name.replace(/[^\w.-]/g, "_");
    const chemin = `${volume}/uploads/${periode}/${horodatage}_${nomPropre}`;
    await uploadToVolume(chemin, contenu);

    // 4. Déclenchement du job avec les paramètres
    const runId = await runNow(jobId, { periode, fichier: chemin });

    return NextResponse.json({ runId, lignes: lignes.length, fichier: chemin }, { status: 202 });
  } catch (e) {
    return erreurDatabricks(e);
  }
}

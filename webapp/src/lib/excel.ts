import "server-only";
import ExcelJS from "exceljs";
import {
  COLONNES_ATTENDUES,
  ligneBudgetSchema,
  type ErreurValidation,
  type LigneBudget,
} from "./schemas";

const MAX_ERREURS = 50;

/** Convertit une valeur de cellule ExcelJS en valeur JS simple. */
function valeurCellule(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  // Excel transforme souvent "2026-10" en date : on le remet au format AAAA-MM
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  if (typeof v === "object") {
    if ("result" in v) return valeurCellule(v.result as ExcelJS.CellValue); // formule
    if ("richText" in v) return v.richText.map((r) => r.text).join(""); // texte mis en forme
    if ("text" in v) return String(v.text); // lien hypertexte
  }
  return String(v);
}

function enTexte(v: string | number | null): string {
  return v === null ? "" : String(v).trim();
}

function enNombre(v: string | number | null): number | string {
  if (typeof v === "number") return v;
  if (v === null || v === "") return "";
  const n = Number(String(v).replace(/\s/g, "").replace(",", ".")); // "1 234,50" → 1234.5
  return Number.isNaN(n) ? String(v) : n;
}

export interface ResultatLecture {
  lignes: LigneBudget[];
  erreurs: ErreurValidation[];
}

/**
 * Lit l'onglet "budget" et contrôle chaque ligne.
 * Toutes les erreurs sont collectées (pas d'arrêt à la première) pour que
 * l'utilisateur puisse tout corriger en une fois.
 */
export async function lireEtValiderBudget(
  contenu: ArrayBuffer,
  periode: string,
): Promise<ResultatLecture> {
  const classeur = new ExcelJS.Workbook();
  try {
    await classeur.xlsx.load(contenu);
  } catch {
    return { lignes: [], erreurs: [{ message: "Le fichier n'est pas un classeur Excel lisible" }] };
  }

  const feuille = classeur.getWorksheet("budget");
  if (!feuille) {
    const noms = classeur.worksheets.map((w) => w.name).join(", ");
    return {
      lignes: [],
      erreurs: [{ message: `Onglet "budget" introuvable (onglets présents : ${noms || "aucun"})` }],
    };
  }

  // 1. En-têtes : on repère la position de chaque colonne attendue
  const enTetes = new Map<string, number>();
  feuille.getRow(1).eachCell((cell, col) => {
    enTetes.set(enTexte(valeurCellule(cell.value)).toLowerCase(), col);
  });
  const manquantes = COLONNES_ATTENDUES.filter((c) => !enTetes.has(c));
  if (manquantes.length) {
    return {
      lignes: [],
      erreurs: [{ ligne: 1, message: `Colonne(s) manquante(s) : ${manquantes.join(", ")}` }],
    };
  }
  const col = (nom: (typeof COLONNES_ATTENDUES)[number]) => enTetes.get(nom)!;

  // 2. Lignes de données
  const lignes: LigneBudget[] = [];
  const erreurs: ErreurValidation[] = [];
  const moisTrouves = new Set<string>();
  const cles = new Map<string, number>(); // "entite|compte" → première ligne rencontrée

  feuille.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;
    const brut = {
      entite: enTexte(valeurCellule(row.getCell(col("entite")).value)),
      compte: enTexte(valeurCellule(row.getCell(col("compte")).value)),
      libelle: enTexte(valeurCellule(row.getCell(col("libelle")).value)),
      mois: enTexte(valeurCellule(row.getCell(col("mois")).value)),
      montant: enNombre(valeurCellule(row.getCell(col("montant")).value)),
    };

    const res = ligneBudgetSchema.safeParse(brut);
    if (!res.success) {
      for (const issue of res.error.issues) {
        erreurs.push({ ligne: numero, champ: String(issue.path[0]), message: issue.message });
      }
      return;
    }

    moisTrouves.add(res.data.mois);
    const cle = `${res.data.entite}|${res.data.compte}`;
    const premiere = cles.get(cle);
    if (premiere) {
      erreurs.push({
        ligne: numero,
        message: `Doublon : entité ${res.data.entite} / compte ${res.data.compte} (déjà en ligne ${premiere})`,
      });
    } else {
      cles.set(cle, numero);
    }
    lignes.push(res.data);
  });

  if (lignes.length === 0 && erreurs.length === 0) {
    erreurs.push({ message: "Le fichier ne contient aucune ligne de données" });
  }

  // 3. Cohérence avec la période : un seul message clair plutôt qu'une erreur par ligne
  const autresMois = [...moisTrouves].filter((m) => m !== periode);
  if (autresMois.length) {
    erreurs.unshift({
      champ: "mois",
      message:
        moisTrouves.size === 1
          ? `Le fichier contient des données de ${autresMois[0]}, alors que vous avez choisi la période ${periode}`
          : `Le fichier mélange plusieurs mois (${[...moisTrouves].sort().join(", ")}) ; seule la période ${periode} est attendue`,
    });
  }

  return { lignes, erreurs: erreurs.slice(0, MAX_ERREURS) };
}

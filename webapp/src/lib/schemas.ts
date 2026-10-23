import { z } from "zod";

/**
 * Schémas Zod partagés entre le navigateur et le serveur.
 * Côté navigateur : retour immédiat à l'utilisateur (confort).
 * Côté serveur    : la vraie barrière, car une requête peut toujours être forgée.
 */

export const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo

export const periodeSchema = z
  .string({ error: "La période est obligatoire" })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "La période doit être au format AAAA-MM (ex. 2026-10)");

export const fichierSchema = z
  .instanceof(File, { error: "Le fichier Excel est obligatoire" })
  .refine((f) => f.size > 0, "Le fichier est vide")
  .refine((f) => f.size <= TAILLE_MAX, "Le fichier dépasse 5 Mo")
  .refine((f) => f.name.toLowerCase().endsWith(".xlsx"), "Seuls les fichiers .xlsx sont acceptés");

export const formulaireImportSchema = z.object({
  periode: periodeSchema,
  fichier: fichierSchema,
});

/** Une ligne du fichier budget, après lecture de l'Excel. */
export const ligneBudgetSchema = z.object({
  entite: z.string().trim().min(1, "Entité vide"),
  compte: z.string().regex(/^\d{4}$/, "Le compte doit faire 4 chiffres"),
  libelle: z.string().trim().min(1, "Libellé vide"),
  mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois invalide (format AAAA-MM attendu)"),
  montant: z.number({ error: "Le montant doit être un nombre" }).nonnegative("Le montant ne peut pas être négatif"),
});

export type LigneBudget = z.infer<typeof ligneBudgetSchema>;

export const COLONNES_ATTENDUES = ["entite", "compte", "libelle", "mois", "montant"] as const;

/** Format d'erreur renvoyé par l'API et affiché par l'écran. */
export interface ErreurValidation {
  ligne?: number; // numéro de ligne Excel (en-tête = ligne 1)
  champ?: string;
  message: string;
}

/** Types partagés entre le serveur et l'écran (aucun code exécuté ici). */

/** Statuts simplifiés, pensés pour l'utilisateur métier. */
export type Statut = "EN_ATTENTE" | "EN_COURS" | "SUCCES" | "ECHEC" | "ANNULE";

export interface RunInfo {
  runId: number;
  statut: Statut;
  termine: boolean;
  debut: number | null;
  fin: number | null;
  urlDatabricks: string | null;
  parametres: Record<string, string>;
  taches: { cle: string; statut: Statut }[];
  /** Message à afficher en cas d'échec (sans la pile d'appels Python). */
  erreur: string | null;
}

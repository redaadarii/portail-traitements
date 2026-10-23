import { FormulaireImport } from "@/components/FormulaireImport";

export default function Accueil() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Portail de traitements</p>
        <h1 className="mt-1 text-2xl font-semibold">Import du budget mensuel</h1>
        <p className="mt-2 text-slate-600">
          Choisissez la période, déposez le fichier Excel : il est contrôlé, puis chargé par un traitement
          Databricks.
        </p>
      </header>
      <FormulaireImport />
    </main>
  );
}

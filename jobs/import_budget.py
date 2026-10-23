# Databricks notebook source
# MAGIC %md
# MAGIC # Import budget mensuel
# MAGIC Lit un fichier Excel déposé dans un Volume, le contrôle, puis l'écrit dans une table Delta.
# MAGIC
# MAGIC Paramètres (widgets, remplis automatiquement par les paramètres du Job) :
# MAGIC - `periode` : mois traité, format `AAAA-MM`
# MAGIC - `fichier` : chemin du fichier Excel dans le Volume

# COMMAND ----------

# MAGIC %pip install openpyxl --quiet

# COMMAND ----------

# Déclaration des paramètres. En exécution manuelle, on garde les valeurs par défaut ;
# lancé par un Job, les "job parameters" du même nom remplacent ces valeurs.
dbutils.widgets.text("periode", "2026-10")
dbutils.widgets.text("fichier", "/Volumes/workspace/portail/fichiers/budget_2026_10.xlsx")

periode = dbutils.widgets.get("periode")
fichier = dbutils.widgets.get("fichier")
TABLE = "workspace.portail.budget"

print(f"Période : {periode}")
print(f"Fichier : {fichier}")

# COMMAND ----------

import re
import pandas as pd

# 1. Contrôle des paramètres
if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", periode):
    raise ValueError(f"Paramètre 'periode' invalide : '{periode}' (format attendu AAAA-MM)")

# 2. Lecture de l'Excel (les Volumes s'utilisent comme un chemin de fichier classique)
df = pd.read_excel(fichier, sheet_name="budget", dtype={"compte": str, "mois": str})

# 3. Contrôles de conformité du fichier
erreurs = []

colonnes_attendues = ["entite", "compte", "libelle", "mois", "montant"]
manquantes = [c for c in colonnes_attendues if c not in df.columns]
if manquantes:
    raise ValueError(f"Colonnes manquantes : {manquantes}")

for i, ligne in df.iterrows():
    num = i + 2  # +2 : ligne d'en-tête + index qui commence à 0 => numéro de ligne Excel
    if pd.isna(ligne["entite"]) or str(ligne["entite"]).strip() == "":
        erreurs.append(f"Ligne {num} : entité vide")
    if not re.fullmatch(r"\d{4}", str(ligne["compte"])):
        erreurs.append(f"Ligne {num} : compte '{ligne['compte']}' invalide (4 chiffres attendus)")
    if str(ligne["mois"]) != periode:
        erreurs.append(f"Ligne {num} : mois '{ligne['mois']}' différent de la période {periode}")
    if not pd.api.types.is_number(ligne["montant"]) or pd.isna(ligne["montant"]) or ligne["montant"] < 0:
        erreurs.append(f"Ligne {num} : montant '{ligne['montant']}' invalide")

doublons = df[df.duplicated(subset=["entite", "compte"], keep=False)]
for _, d in doublons.iterrows():
    erreurs.append(f"Doublon : entité {d['entite']} / compte {d['compte']}")

if erreurs:
    # Lever une exception fait échouer la tâche : le Job passe en FAILED
    # et le message apparaît dans le statut du run.
    raise ValueError(f"{len(erreurs)} erreur(s) dans le fichier :\n" + "\n".join(erreurs))

print(f"✅ Fichier conforme : {len(df)} lignes")

# COMMAND ----------

from pyspark.sql import functions as F

# 4. Écriture idempotente : si on relance la même période, on remplace ses lignes
#    au lieu de les dupliquer.
sdf = (
    spark.createDataFrame(df)
    .withColumn("montant", F.col("montant").cast("decimal(18,2)"))
    .withColumn("date_chargement", F.current_timestamp())
)

(
    sdf.write.format("delta")
    .mode("overwrite")
    .option("replaceWhere", f"mois = '{periode}'")
    .saveAsTable(TABLE)
)

print(f"✅ {sdf.count()} lignes écrites dans {TABLE} pour {periode}")

# COMMAND ----------

# 5. Valeur renvoyée au Job : l'application pourra la lire plus tard via l'API.
dbutils.notebook.exit(f"OK: {len(df)} lignes chargées pour {periode}")

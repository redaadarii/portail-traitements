# Databricks notebook source
# MAGIC %md
# MAGIC # Setup du projet
# MAGIC Crée le schéma, le volume et la table. Idempotent : peut être relancé sans risque.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("schema", "portail")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {catalog}.{schema}.fichiers")
spark.sql(f"""
  CREATE TABLE IF NOT EXISTS {catalog}.{schema}.budget (
    entite STRING,
    compte STRING,
    libelle STRING,
    mois STRING,
    montant DECIMAL(18,2),
    date_chargement TIMESTAMP
  )
""")

print(f"✅ {catalog}.{schema} prêt (volume 'fichiers', table 'budget')")

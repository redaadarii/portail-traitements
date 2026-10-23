import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portail de traitements",
  description: "Lancement et suivi des traitements Databricks",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CODWSAP — Automatisez vos commandes COD sur WhatsApp",
  description:
    "Plateforme algérienne pour marchands COD : confirmation WhatsApp, gestion des commandes, suivi des colis multi-transporteurs, automatisations et statistiques.",
  metadataBase: new URL("https://codwsap.app"),
  openGraph: {
    title: "CODWSAP — Automatisez vos commandes COD sur WhatsApp",
    description: "Confirmez vos commandes, notifiez vos clients, suivez vos colis et pilotez tout depuis un seul tableau de bord.",
    locale: "fr_DZ",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c5cf0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}

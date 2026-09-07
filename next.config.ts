import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `better-sqlite3` est une dépendance OPTIONNELLE réservée au développement
  // local (DB_DRIVER=sqlite). En production (Vercel + Supabase) le driver
  // PostgreSQL est seul utilisé et le module natif n'est pas installé.
  // On le marque comme externe pour que le bundler ne tente pas de le résoudre
  // et n'émette pas d'avertissement à la compilation ; l'import dynamique dans
  // src/server/db/index.ts est déjà protégé par un try/catch.
  serverExternalPackages: ["better-sqlite3", "pg"],
};

export default nextConfig;

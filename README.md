# CODWSAP

Plateforme SaaS multi-tenant pour les e-commerçants algériens en paiement à la livraison (COD) :
automatisation WhatsApp, gestion des commandes, connecteurs transporteurs, suivi des colis,
conversations centralisées et statistiques opérationnelles.

- **Site public** : français (architecture prête pour l'arabe et l'anglais, `?lang=ar`)
- **Dashboard marchand** : français **et** arabe avec support RTL
- **Console super admin** (`/admin`) : français uniquement

## Démarrage

```bash
npm install
cp .env.example .env.local     # puis générer les clés: openssl rand -hex 32
npm run seed                   # données de démonstration
npm run dev                    # http://localhost:3000
npm run worker                 # boucle de traitement en arrière-plan (autre terminal)
```

Comptes créés par le seed (mot de passe `codwsap2026`) :

| Rôle | Email |
| --- | --- |
| Super admin | `admin@codwsap.app` |
| Propriétaire marchand | `demo@codwsap.app` |
| Agent | `agent@codwsap.app` |

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `DATABASE_FILE` | Chemin de la base locale (driver portable) |
| `CREDENTIALS_KEY` | Clé AES-256-GCM chiffrant les secrets marchands |
| `SESSION_SECRET` | Signature HS256 des cookies de session |
| `META_APP_SECRET` | Vérification de signature des webhooks Meta |
| `CRON_SECRET` | Jeton Bearer attendu par `/api/cron` |

Aucun secret marchand (jeton WhatsApp, clé transporteur, credentials Google, secret webhook)
n'est jamais renvoyé au navigateur : ils sont chiffrés en base et seulement masqués côté UI.

## Architecture

```
src/
  app/
    (marketing)/        site public FR/AR
    dashboard/          espace marchand (FR/AR, RTL)
    admin/              console super admin (FR)
    onboarding/         assistant de configuration en 8 étapes
    api/                routes serveur (auth, orders, whatsapp, delivery, admin, webhooks, cron)
  server/
    db/                 schéma SQL + driver portable
    auth/               sessions, rôles, autorisation par tenant
    services/           logique métier (orders, messaging, automations, delivery, analytics…)
    connectors/
      whatsapp/         provider Meta Cloud API + provider sandbox
      delivery/         couche d'abstraction transporteurs (EcoTrack, Yalidine, ZR Express, Navex, générique)
      orders/           sources de commandes (Google Sheets, webhook, API, CSV, manuel)
    jobs/               file de traitements avec retries bornés (3 tentatives puis alerte)
  components/           UI kit, shells dashboard et marketing
  lib/                  domaine (statuts, wilayas), i18n, normalisation téléphone
supabase/migrations/    migrations Postgres + RLS pour le déploiement
scripts/                seed et worker
```

### Multi-tenant et sécurité

- `merchant_id` sur chaque entité, index sur les champs chauds.
- Le tenant est **toujours** résolu côté serveur (`requireTenant` / `requirePermission`) ;
  aucun `merchant_id` provenant du client n'est jamais utilisé.
- Rôles : Owner, Admin, Agent (l'agent n'accède ni aux intégrations ni à la facturation).
- Webhooks signés (HMAC-SHA256), idempotence, journalisation et vues d'échec.
- Rate limiting sur l'authentification, la création de commandes, les synchronisations et les webhooks.
- Messages d'erreur en français, sans stack trace ; les erreurs techniques sont centralisées pour le super admin.

### Qualité WhatsApp

Un changement de statut ne déclenche pas systématiquement un envoi. Chaque message passe une chaîne de
règles : pertinence, opt-in/opt-out, cooldown, déduplication, fréquence maximale par commande, approbation
du template, réponse client récente et changement significatif. Les envois bloqués sont comptabilisés et
visibles dans la page Qualité. Les indicateurs Meta sont affichés séparément et jamais inventés :
en l'absence de donnée officielle, l'état reste « Inconnu ».

### Livraison

La couche transporteur est générique : chaque connecteur déclare ses capacités
(`supportsCreateShipment`, `supportsTracking`, `supportsWebhooks`, `supportsStatusPolling`…).
Les statuts bruts des transporteurs sont conservés et normalisés dans un modèle interne unique.
Un marchand dont le transporteur n'est pas listé peut envoyer une demande visible par le super admin.

## Base de données

`src/server/db/schema.sql` porte le schéma de référence utilisé par le driver portable local.
`supabase/migrations/` contient la version Postgres/Supabase avec les politiques RLS pour la production.
Les deux dialectes décrivent le même modèle : marchands, utilisateurs, abonnements, commandes, clients,
connexions et évènements de livraison, conversations et messages WhatsApp, templates, automatisations,
intégrations, notifications, webhooks, journaux d'API et d'audit, jobs.

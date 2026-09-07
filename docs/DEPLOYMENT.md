# CODWSAP — Checklist de déploiement staging (Railway)

Document opérationnel : à suivre de haut en bas. Toutes les commandes et
variables sont données telles quelles.

---

## 0. Ce qui a été vérifié avant ce document

| Vérification | Commande | Résultat |
|---|---|---|
| Installation | `npm install` | OK |
| Types | `npm run typecheck` | 0 erreur |
| Lint | `npm run lint` | 0 erreur, 0 avertissement |
| Build production | `npm run build` | OK |
| Migrations sur PostgreSQL réel | `npm run db:migrate` | 2/2 appliquées |
| Isolation multi-tenant | `npm run test:isolation` | **34/34** |
| Worker + sonde de santé | `npm run worker` | HTTP 200 |
| Install type production | `npm ci --omit=dev` | OK (`tsx` et `next` présents) |

Détail des 34 tests d'isolation : 12 applicatif (HTTP), 6 autorisation,
16 RLS PostgreSQL. Voir §7.

---

## 1. Pousser le projet sur VOTRE dépôt GitHub

Le code vit actuellement sur `Zinebme/codwsap`, branche
`arena/01a07cf6-codwsap`. Le jeton de l'agent ne peut pas créer de dépôt à
votre place : faites-le une fois, à la main.

```bash
# 1. Créez un dépôt vide sur https://github.com/new  (ex. « codwsap »),
#    SANS README, SANS .gitignore, SANS licence.

# 2. Depuis votre machine :
git clone https://github.com/Zinebme/codwsap.git codwsap
cd codwsap
git checkout arena/01a07cf6-codwsap

# 3. Basculez sur votre dépôt et publiez la branche principale :
git remote add mine https://github.com/<VOTRE-COMPTE>/codwsap.git
git push mine arena/01a07cf6-codwsap:main
```

Vérifiez ensuite sur GitHub que `.env`, `.env.local` et `data/` sont **absents**
(ils sont dans `.gitignore`).

---

## 2. Créer le projet Railway

1. https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Sélectionnez votre dépôt, branche `main`.
3. Dans le projet, ajoutez **+ New** → **Database** → **PostgreSQL**.

Vous obtenez donc **3 services** : `web`, `worker`, `Postgres`.
(Redis n'est **pas** nécessaire — voir §8.)

---

## 3. Générer les secrets

Exécutez localement, puis conservez le résultat dans un gestionnaire de mots de passe :

```bash
echo "CREDENTIALS_KEY=$(openssl rand -hex 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "CRON_SECRET=$(openssl rand -hex 32)"
```

> `CREDENTIALS_KEY` chiffre les identifiants marchands (jetons WhatsApp, clés
> transporteurs). **Le perdre rend ces données irrécupérables.**
> N'utilisez jamais la même clé en staging et en production.

---

## 4. Variables d'environnement — service **web**

À saisir dans Railway → service web → **Variables** → *Raw Editor* :

```
NODE_ENV=production
APP_ENV=staging
DATABASE_URL=${{ Postgres.DATABASE_URL }}
DB_DRIVER=postgres
PGSSL=require
PGPOOL_MAX=10
CREDENTIALS_KEY=<collez la valeur générée>
SESSION_SECRET=<collez la valeur générée>
CRON_SECRET=<collez la valeur générée>
META_APP_SECRET=<App Secret de votre application Meta, ou laissez vide>
```

Ne définissez **pas** `PORT` : Railway l'injecte.

### Réglages du service web

| Réglage | Valeur |
|---|---|
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run db:migrate && npm run start` |
| Healthcheck Path | `/api/health` |
| Healthcheck Timeout | `120` |
| Restart Policy | `ON_FAILURE`, max 5 |

Ces valeurs sont déjà dans `railway.json` ; l'interface les reprend
automatiquement. Le `db:migrate` au démarrage est **idempotent** et protégé par
un verrou consultatif PostgreSQL : plusieurs instances peuvent démarrer
simultanément sans conflit.

---

## 5. Variables d'environnement — service **worker**

Créez un second service **depuis le même dépôt** (+ New → GitHub Repo → même
dépôt), nommez-le `worker`, puis :

```
NODE_ENV=production
APP_ENV=staging
DATABASE_URL=${{ Postgres.DATABASE_URL }}
DB_DRIVER=postgres
PGSSL=require
PGPOOL_MAX=5
CREDENTIALS_KEY=<LA MÊME que le service web>
SESSION_SECRET=<LA MÊME que le service web>
WORKER_INTERVAL_MS=15000
WORKER_BATCH=20
WORKER_STALE_MS=120000
```

### Réglages du service worker

| Réglage | Valeur |
|---|---|
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run worker` |
| Healthcheck Path | `/health` |
| Restart Policy | `ON_FAILURE`, max 5 |

> `CREDENTIALS_KEY` **doit** être identique côté web et worker : le worker
> déchiffre les identifiants marchands pour appeler WhatsApp et les
> transporteurs. Une clé différente = tous les envois échouent.

Le worker n'a pas besoin de domaine public. Sa sonde `/health` renvoie 503 s'il
n'a pas bouclé depuis `WORKER_STALE_MS` ou après 5 échecs consécutifs.

---

## 6. Premier démarrage

1. **Deploy** le service web. Attendez le healthcheck vert.
2. **Deploy** le worker.
3. Créez votre compte super administrateur (aucun n'existe par défaut) :

Railway → service web → onglet **Shell** :

```bash
npm run admin:create -- --email vous@votredomaine.tld
```

Le mot de passe généré s'affiche **une seule fois** : notez-le, puis changez-le
après la première connexion.

4. Ouvrez `https://<votre-domaine>.up.railway.app` et connectez-vous.

### Aucune donnée de démonstration n'est créée

Le seed **refuse** de s'exécuter quand `APP_ENV=staging` ou `production`.
Pour peupler une base de démonstration jetable :

```bash
APP_ENV=test ALLOW_SEED=true npm run seed
```

---

## 7. Ce que garantit l'isolation multi-tenant

Deux couches indépendantes, testées par `npm run test:isolation` contre un vrai
PostgreSQL :

**Couche 1 — filtrage applicatif (12 tests).** Le marchand A, authentifié par un
vrai cookie de session, tente d'atteindre les données du marchand B via l'API
HTTP : commandes, clients, messages WhatsApp, intégrations, paramètres.
Lectures et écritures croisées renvoient 404/403, et la base est relue pour
confirmer qu'aucune ligne de B n'a changé. Les actions groupées ignorent les
identifiants étrangers.

**Couche 2 — RLS PostgreSQL (16 tests).** Les mêmes tentatives sont rejouées en
SQL direct via le rôle `codwsap_tenant`, **non propriétaire** donc réellement
soumis aux policies (le test échoue si `rolbypassrls` est vrai). Même une
requête sans clause `WHERE`, un `UPDATE`, un `DELETE` ou un `INSERT` au nom de B
ne touchent aucune ligne. Contrôles positifs inclus : A voit bien ses données,
B voit bien les siennes.

**Autorisation (6 tests).** Anonyme → 401 ; marchand sur `/admin` → 403 ;
webhooks à signature ou jeton invalide → rejetés ; `/api/health` public → 200.

> Le rôle applicatif est propriétaire des tables et n'est donc pas soumis à la
> RLS : il a besoin de requêtes légitimement inter-tenants (connexion par email,
> webhooks entrants, console super admin). Pour lui, l'isolation est assurée par
> la couche 1. La RLS est la défense en profondeur pour tout accès direct à la
> base (BI, exports, requêtes manuelles).

---

## 8. Redis / BullMQ — pourquoi ce n'est pas déployé

La file d'attente utilise la table `jobs` PostgreSQL, réclamée avec
`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *`.
C'est atomique : plusieurs répliques du worker peuvent tourner sans jamais
traiter deux fois la même tâche.

Les exigences visées par BullMQ sont déjà couvertes :

| Besoin | Implémentation |
|---|---|
| Web et worker séparés | deux services Railway distincts |
| Réessais bornés | 3 tentatives, backoff progressif, puis `failed` + notification |
| Pas de boucle infinie | `max_attempts` en base, jamais réarmé |
| Logs | JSON structuré sur stdout |
| Sonde de santé | `/health` du worker (en attente / échecs / bloqués) |

Ajouter Redis maintenant introduirait un service, un point de panne et un coût
supplémentaires sans bénéfice au volume visé. Migrer plus tard ne change que
`src/server/jobs/queue.ts` : `.env.staging.example` documente déjà `REDIS_URL`.

---

## 9. Sécurité — état

- **Aucun identifiant de démonstration.** Le seed refuse de tourner en
  staging/production ; plus aucun `admin@codwsap.app`. Les mots de passe du seed
  sont générés aléatoirement, jamais prévisibles.
- **Aucun super admin automatique.** Création explicite via `admin:create`.
- **Secrets jamais exposés au frontend.** Jetons WhatsApp, secrets Meta, clés
  transporteurs et identifiants Google sont chiffrés en base avec
  `CREDENTIALS_KEY` et ne sortent jamais du serveur.
- **Webhooks.** Signature Meta `X-Hub-Signature-256` vérifiée en comparaison à
  temps constant ; webhooks commandes authentifiés par clé API ; idempotence par
  `webhook_events` ; limitation de débit par expéditeur.
- **Sessions.** JWT signé, cookie `httpOnly` + `secure` + `sameSite`, révocation
  via `sessions_revoked`.
- **Health.** `/api/health` ne divulgue ni version, ni schéma, ni configuration.

### Avant d'ouvrir au public

- [ ] Domaine en HTTPS (automatique sur Railway).
- [ ] Sauvegardes PostgreSQL activées (Railway → Postgres → Backups).
- [ ] `CREDENTIALS_KEY` et `SESSION_SECRET` sauvegardés hors Railway.
- [ ] `META_APP_SECRET` renseigné avant de brancher un vrai numéro WhatsApp.
- [ ] Alerte sur `/api/health` et sur le `/health` du worker.

### Vulnérabilités connues

`npm audit` signale 2 alertes (PostCSS, transitives via `next`). Elles
concernent la **chaîne de build**, pas le runtime, et ne sont pas exploitables à
distance sur l'application déployée. Le correctif impose `next@16` (majeure) :
à planifier hors mise en production initiale.

---

## 10. Commandes de référence

```bash
# Développement local (SQLite)
npm run dev

# Développement local sur PostgreSQL réel, sans Docker
npm run pg:start                      # démarre Postgres sur le port 55432
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/codwsap \
  DB_DRIVER=postgres npm run db:migrate

# Vérification complète (types + lint + build)
npm run verify

# Isolation multi-tenant de bout en bout (Postgres réel, 2 marchands)
npm run test:isolation

# Migrations (idempotentes)
npm run db:migrate

# Régénérer la migration Postgres depuis le schéma canonique
npm run db:gen-schema

# Créer un super administrateur
npm run admin:create -- --email vous@domaine.tld

# Worker
npm run worker
```

---

## 11. Dépannage

| Symptôme | Cause probable | Correctif |
|---|---|---|
| Healthcheck web en échec | `DATABASE_URL` absent ou Postgres non lié | Vérifiez `${{ Postgres.DATABASE_URL }}` |
| `DATABASE_URL est requis` | `DB_DRIVER=postgres` sans URL | Ajoutez la variable |
| Connexion SSL refusée | TLS exigé par le fournisseur | `PGSSL=require` |
| Messages WhatsApp toujours en échec | `CREDENTIALS_KEY` différente entre web et worker | Alignez les deux |
| Worker `/health` en 503 | Base injoignable ou boucle bloquée | Consultez les logs du worker |
| `too many connections` | `PGPOOL_MAX` × répliques > limite du plan | Réduisez `PGPOOL_MAX` |
| Build échoue sur `better-sqlite3` | Compilation native | Dépendance **optionnelle** : sans effet sur Postgres |

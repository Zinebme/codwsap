# CODWSAP — Déploiement Vercel + Supabase

Guide opérationnel, clic par clic. Aucune connaissance préalable de Vercel ou de
Supabase n'est supposée.

**Architecture cible**

| Composant | Service | Rôle |
|---|---|---|
| Web, API, webhooks | Vercel | application Next.js (fonctions serverless) |
| PostgreSQL + RLS | Supabase | base de données et isolation multi-tenant |
| Tâches de fond | Supabase Cron (`pg_cron` + `pg_net`) | appelle `/api/cron` toutes les 1–5 min |

Il n'y a **plus de worker permanent**. La file d'attente reste dans PostgreSQL
(`FOR UPDATE SKIP LOCKED`) : `/api/cron` en draine un lot borné à chaque appel.
Aucun Redis, aucun BullMQ.

---

## 0. Vérifications déjà passées sur ce dépôt

| Vérification | Commande | Résultat |
|---|---|---|
| Types | `npm run typecheck` | 0 erreur |
| Lint | `npm run lint` | 0 erreur, 0 avertissement |
| Build production | `npm run build` | OK, 0 avertissement |
| Migrations PostgreSQL réel | `npm run db:migrate` | 2/2 appliquées |
| Isolation + sécurité | `npm run test:isolation` | **37/37** |

Les 37 tests : 12 filtrage applicatif (HTTP), 9 autorisation (dont 3 sur
`/api/cron`), 16 RLS PostgreSQL. Voir §9.

---

## 1. Créer le projet Supabase

1. Allez sur **https://supabase.com/dashboard** → **New project**.
2. Renseignez :
   - **Name** : `codwsap-staging`
   - **Database Password** : cliquez sur *Generate a password* et
     **copiez-le immédiatement** dans votre gestionnaire de mots de passe.
     Supabase ne le réaffichera jamais.
   - **Region** : choisissez la plus proche de vos usagers.
     Pour l'Algérie → `Europe West (Paris)` ou `Europe Central (Frankfurt)`.
3. **Create new project**, puis patientez ~2 minutes.

---

## 2. Récupérer les DEUX URL de connexion

Supabase → bouton **Connect** (en haut) → onglet **Connection string**.

Vous avez besoin de deux chaînes différentes :

### a) `DATABASE_URL` — runtime (obligatoire)

Sélectionnez **Transaction pooler**. Format :

```
postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
```

→ **port 6543**. C'est la seule adaptée au serverless : chaque fonction Vercel
est un conteneur éphémère, et le pooler mutualise les connexions. La connexion
directe serait saturée en quelques secondes.

Ajoutez les paramètres à la fin :

```
?pgbouncer=true&sslmode=require
```

### b) `MIGRATION_DATABASE_URL` — migrations uniquement

Sélectionnez **Session pooler** (ou **Direct connection**). Format :

```
postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

→ **port 5432**. Les migrations posent un verrou consultatif qui doit survivre
entre plusieurs requêtes : le mode transaction ne le garantit pas.

Ajoutez :

```
?sslmode=require
```

Dans les deux cas, remplacez `[YOUR-PASSWORD]` par le mot de passe de l'étape 1.
S'il contient des caractères spéciaux (`@`, `:`, `/`, `#`), encodez-les en
pourcentage (`@` → `%40`).

> **Repère mnémotechnique : 6543 = runtime, 5432 = migrations.**

---

## 3. Appliquer les migrations

Depuis **votre machine** (recommandé — les migrations ne doivent pas tourner à
chaque invocation de fonction) :

```bash
git clone <votre-dépôt> codwsap
cd codwsap
npm install

export MIGRATION_DATABASE_URL='postgresql://postgres.<ref>:<MOT_DE_PASSE>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'
npm run db:migrate
```

Sortie attendue :

```
Cible : postgresql://postgres.<ref>:****@aws-0-<region>.pooler.supabase.com:5432/postgres
  + 0001_schema.sql ... ok
  + 0002_rls.sql ... ok
2 migration(s) appliquée(s).
```

Le script est **idempotent** : relancez-le sans risque, les migrations déjà
appliquées sont ignorées (table `schema_migrations`).

**Vérification.** Supabase → **Table Editor** : vous devez voir 30 tables
(`merchants`, `orders`, `customers`, `whatsapp_messages`, `jobs`…).
Puis Supabase → **Database** → **Policies** : la RLS doit être active avec une
politique `tenant_isolation` sur les tables portant `merchant_id`.

---

## 4. Générer les secrets

```bash
echo "CREDENTIALS_KEY=$(openssl rand -hex 32)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "CRON_SECRET=$(openssl rand -hex 32)"
```

Conservez ces trois valeurs dans un gestionnaire de mots de passe.

> `CREDENTIALS_KEY` chiffre les identifiants marchands (jetons WhatsApp, clés
> transporteurs). **La perdre les rend irrécupérables** et obligera chaque
> marchand à les ressaisir.

---

## 5. Déployer sur Vercel

1. Poussez le dépôt sur GitHub (branche `main`).
2. **https://vercel.com/new** → **Import Git Repository** → sélectionnez le dépôt.
3. Vercel détecte Next.js automatiquement. **Ne modifiez pas** les commandes de
   build : `vercel.json` les fournit déjà.
4. Avant de cliquer sur **Deploy**, dépliez **Environment Variables** et
   ajoutez :

| Name | Value |
|---|---|
| `APP_ENV` | `staging` |
| `DATABASE_URL` | l'URL **6543** de l'étape 2a |
| `DB_DRIVER` | `postgres` |
| `PGSSL` | `require` |
| `CREDENTIALS_KEY` | valeur générée |
| `SESSION_SECRET` | valeur générée |
| `CRON_SECRET` | valeur générée |
| `META_APP_SECRET` | App Secret Meta (ou laissez vide pour l'instant) |

Ne définissez **pas** `NODE_ENV` ni `PORT` : Vercel les gère.
`MIGRATION_DATABASE_URL` n'est **pas** nécessaire côté Vercel si vous migrez
depuis votre machine (recommandé).

5. **Deploy**. Notez le domaine obtenu, par exemple
   `https://codwsap-staging.vercel.app`.

**Vérification** :

```bash
curl https://<VOTRE-DOMAINE>.vercel.app/api/health
# {"status":"ok","database":"postgres","uptime_s":…,"latency_ms":…}
```

Si `"database"` vaut `sqlite`, `DB_DRIVER` ou `DATABASE_URL` est mal renseigné.

---

## 6. Planifier `/api/cron` avec Supabase Cron (recommandé)

**Pourquoi pas Vercel Cron ?** Le plan **Hobby de Vercel n'autorise qu'une
exécution par jour** — bien trop rare pour ce SaaS (envois WhatsApp, suivi de
livraison, synchronisation Sheets). Un déploiement échoue même si vous écrivez
un intervalle plus court. `vercel.json` contient donc une entrée quotidienne
compatible Hobby, qui sert uniquement de **filet de sécurité**.

Le vrai planificateur est **Supabase Cron** (`pg_cron` + `pg_net`), qui descend
à la minute, gratuitement.

### 6.1 Activer les extensions

Supabase → **Database** → **Extensions** : recherchez et activez

- `pg_cron` (souvent déjà actif par défaut)
- `pg_net`

Équivalent en SQL :

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

### 6.2 Enregistrer le secret puis planifier la tâche

Supabase → **SQL Editor** → **New query**.

D'abord le secret, stocké chiffré dans le Vault. On évite ainsi de l'écrire en
clair dans le corps de la tâche, que tout rôle ayant accès au schéma `cron`
pourrait lire.

```sql
select vault.create_secret(
  '<VOTRE_CRON_SECRET>',           -- exactement la valeur mise dans Vercel
  'codwsap_cron_secret',
  'Jeton Bearer utilisé par pg_cron pour appeler /api/cron sur Vercel.'
);
```

> Pour faire tourner le secret plus tard :
> `select vault.update_secret((select id from vault.secrets where name = 'codwsap_cron_secret'), '<NOUVEAU_SECRET>');`
> puis mettez `CRON_SECRET` à jour dans Vercel et redéployez.

Ensuite la tâche planifiée — remplacez `<VOTRE-DOMAINE>` :

```sql
select cron.schedule(
  'codwsap-worker',
  '* * * * *',                       -- toutes les minutes
  $$
  select net.http_post(
    url     := 'https://<VOTRE-DOMAINE>.vercel.app/api/cron',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret
                                     from vault.decrypted_secrets
                                     where name = 'codwsap_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
```

Pour un rythme plus économe, remplacez `'* * * * *'` par `'*/5 * * * *'`
(toutes les 5 minutes). `/api/cron` étant borné dans le temps (45 s de travail
utile, `maxDuration` 60 s), un appel par minute ne se chevauche pas
dangereusement : la réclamation `FOR UPDATE SKIP LOCKED` empêche de toute façon
deux exécutions de traiter la même tâche.

### 6.3 Vérifier que ça tourne

```sql
-- La tâche est-elle enregistrée ?
select jobid, jobname, schedule, active from cron.job;

-- Les 10 dernières exécutions (status doit valoir 'succeeded')
select runid, status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'codwsap-worker')
order by start_time desc
limit 10;

-- Réponses HTTP renvoyées par Vercel (status_code doit valoir 200)
select id, status_code, content::text, created
from net._http_response
order by created desc
limit 10;
```

Un `status_code` à **401** signifie que le `CRON_SECRET` du vault ne correspond
pas à celui de Vercel. Un **503** signifie que `CRON_SECRET` n'est pas défini
côté Vercel.

> **Limite à connaître.** `pg_net` fonctionne en « tire et oublie » : un appel
> qui échoue (5xx, timeout) n'est **pas** réessayé et ne déclenche aucune
> alerte — seule une ligne apparaît dans `net._http_response`. De même, si le
> projet Supabase est en pause ou en incident, `pg_cron` ne tourne plus
> silencieusement. Ce n'est pas bloquant ici : les tâches restent dans la table
> `jobs` et seront traitées au prochain appel réussi, et `/api/cron` relance
> lui-même les tâches restées « running » depuis plus de 15 minutes. Surveillez
> tout de même `cron.job_run_details` (voir §6.3).

### 6.4 Modifier ou supprimer la tâche

```sql
select cron.unschedule('codwsap-worker');
```

### Alternative : Vercel Cron (plan Pro uniquement)

Si vous passez au plan Pro, modifiez `vercel.json` :

```json
"crons": [{ "path": "/api/cron", "schedule": "*/5 * * * *" }]
```

Vercel injecte alors automatiquement l'en-tête
`Authorization: Bearer $CRON_SECRET`. Aucune modification de code n'est requise,
et vous pouvez supprimer la tâche Supabase.

---

## 7. Configurer le webhook Meta (WhatsApp)

Dans **https://developers.facebook.com** → votre application → **WhatsApp** →
**Configuration** → **Webhook** → *Edit* :

| Champ | Valeur |
|---|---|
| **Callback URL** | `https://<VOTRE-DOMAINE>.vercel.app/api/webhooks/whatsapp/<MERCHANT_ID>` |
| **Verify token** | la valeur affichée dans l'application, écran *WhatsApp → Paramètres* |

Puis **Verify and save**, et abonnez-vous au champ **messages**.

`<MERCHANT_ID>` s'obtient dans l'application (Paramètres WhatsApp du marchand) :
chaque marchand a son propre URL de webhook, ce qui préserve l'isolation.

Renseignez enfin `META_APP_SECRET` dans Vercel (Settings → Environment
Variables) avec l'**App Secret** de votre application Meta, puis
**redéployez** : les signatures `X-Hub-Signature-256` sont vérifiées, et sans
cette valeur les webhooks entrants sont refusés.

> Les webhooks transporteurs suivent le même principe :
> `https://<VOTRE-DOMAINE>.vercel.app/api/webhooks/delivery/<CONNECTION_ID>`,
> l'URL exacte étant affichée dans la fiche du connecteur.

---

## 8. Créer le premier super administrateur

Aucun compte administrateur n'existe par défaut, et aucune donnée de
démonstration n'est créée : le seed **refuse** de s'exécuter quand `APP_ENV`
vaut `staging` ou `production`.

Depuis votre machine, en pointant sur la base Supabase :

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<MOT_DE_PASSE>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require'
export DB_DRIVER=postgres
export CREDENTIALS_KEY='<la même que sur Vercel>'

npm run admin:create -- --email vous@votredomaine.tld
```

Le mot de passe généré s'affiche **une seule fois**. Notez-le, connectez-vous
sur `https://<VOTRE-DOMAINE>.vercel.app/login`, puis changez-le.

---

## 9. Ce que garantit l'isolation multi-tenant

Deux couches indépendantes, vérifiées par `npm run test:isolation` contre un
vrai PostgreSQL, avec deux marchands.

**Couche 1 — filtrage applicatif (12 tests).** Le marchand A, authentifié par un
vrai cookie de session, tente d'atteindre les données du marchand B via l'API
HTTP : commandes, clients, messages WhatsApp, intégrations, paramètres. Lectures
et écritures croisées renvoient 404/403, et la base est relue pour confirmer
qu'aucune ligne de B n'a changé. Les actions groupées ignorent les identifiants
étrangers.

**Couche 2 — RLS PostgreSQL (16 tests).** Les mêmes tentatives sont rejouées en
SQL direct via le rôle `codwsap_tenant`, **non propriétaire** donc réellement
soumis aux politiques (le test échoue si `rolbypassrls` est vrai). Même une
requête sans clause `WHERE`, un `UPDATE`, un `DELETE` ou un `INSERT` au nom de B
ne touchent aucune ligne. Contrôles positifs inclus.

**Autorisation (9 tests).** Anonyme → 401 ; marchand sur `/admin` → 403 ;
webhooks à signature ou jeton invalide → rejetés ; `/api/health` → 200 ;
`/api/cron` sans secret → 401, mauvais secret → 401, bon secret → 200.

> Le rôle applicatif est propriétaire des tables et n'est donc pas soumis à la
> RLS : il a besoin de requêtes légitimement inter-tenants (connexion par email,
> webhooks entrants, console super admin). Pour lui, l'isolation est assurée par
> la couche 1. La RLS protège en profondeur tout accès direct à la base
> (SQL Editor Supabase, BI, exports).

---

## 10. Sécurité — état

- **`/api/cron` refuse par défaut.** Sans `CRON_SECRET` configuré, l'endpoint
  renvoie 503 au lieu de s'ouvrir à tous. Comparaison du secret à temps
  constant.
- **Aucun identifiant de démonstration.** Le seed est bloqué en
  staging/production ; les mots de passe de test sont générés aléatoirement.
- **Aucun super admin automatique.** Création explicite via `admin:create`.
- **Secrets jamais exposés au frontend.** Jetons WhatsApp, secrets Meta, clés
  transporteurs et identifiants Google sont chiffrés en base avec
  `CREDENTIALS_KEY`.
- **Webhooks.** Signature Meta `X-Hub-Signature-256` vérifiée en comparaison à
  temps constant, idempotence via `webhook_events`, limitation de débit.
- **Sessions.** JWT signé, cookie `httpOnly` + `secure` + `sameSite`.

### Avant d'ouvrir au public

- [ ] Sauvegardes Supabase activées (Database → Backups).
- [ ] `CREDENTIALS_KEY` et `SESSION_SECRET` sauvegardés hors Vercel.
- [ ] `META_APP_SECRET` renseigné avant de brancher un vrai numéro WhatsApp.
- [ ] `cron.job_run_details` surveillé (échecs répétés = worker à l'arrêt).
- [ ] Mot de passe de la base Supabase changé s'il a circulé.

### Vulnérabilités connues

`npm audit` signale 2 alertes (PostCSS, transitives via `next`). Elles
concernent la **chaîne de build**, pas le runtime, et ne sont pas exploitables à
distance. Le correctif impose `next@16` (version majeure) : à planifier
séparément.

---

## 11. Commandes de référence

```bash
# Développement local (SQLite, aucun service externe)
npm run dev

# Développement local sur PostgreSQL réel, sans Docker
npm run pg:start
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/codwsap \
  DB_DRIVER=postgres npm run db:migrate

# Vérification complète (types + lint + build)
npm run verify

# Isolation multi-tenant de bout en bout (37 tests, Postgres réel)
npm run test:isolation

# Migrations (utilise MIGRATION_DATABASE_URL ?? DATABASE_URL)
npm run db:migrate

# Régénérer la migration Postgres depuis le schéma canonique
npm run db:gen-schema

# Créer un super administrateur
npm run admin:create -- --email vous@domaine.tld

# Déclencher manuellement le worker planifié
curl -X POST https://<VOTRE-DOMAINE>.vercel.app/api/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 12. Dépannage

| Symptôme | Cause probable | Correctif |
|---|---|---|
| `/api/health` renvoie `"database":"sqlite"` | `DB_DRIVER`/`DATABASE_URL` absents | Ajoutez-les puis redéployez |
| `/api/health` en 503 | Base injoignable | Vérifiez `DATABASE_URL` (port **6543**) et `PGSSL=require` |
| `/api/cron` renvoie 503 | `CRON_SECRET` non défini sur Vercel | Ajoutez la variable, redéployez |
| `/api/cron` renvoie 401 | Secret du vault ≠ secret Vercel | Réalignez les deux |
| Aucune tâche traitée | Cron non planifié | `select * from cron.job;` |
| `Max client connections reached` | Mauvaise URL de base | Utilisez le **pooler transactionnel (6543)**, pas 5432 |
| Migrations bloquées | Verrou sur le pooler transactionnel | Utilisez `MIGRATION_DATABASE_URL` en **5432** |
| Messages WhatsApp en échec | `CREDENTIALS_KEY` changée | Restaurez la clé d'origine |
| Webhook Meta refusé | `META_APP_SECRET` absent ou faux | Corrigez, puis redéployez |
| Build échoue sur `better-sqlite3` | Module natif | Dépendance **optionnelle** : sans effet en production |

-- CODWSAP — Row Level Security (PostgreSQL).
--
-- ARCHITECTURE (identique au modèle Supabase) — deux rôles :
--
--   1. le rôle PROPRIÉTAIRE (celui qui exécute les migrations, ex. `postgres`)
--      n'est pas soumis à la RLS. C'est le rôle applicatif : il a besoin de
--      requêtes légitimement inter-tenants (connexion par email, webhooks entrants
--      avant authentification, console super admin). Pour ce rôle, l'isolation est
--      garantie par le filtrage applicatif (requireTenant / requirePermission), qui
--      est testé séparément.
--
--   2. le rôle `codwsap_tenant` (NON propriétaire) est PLEINEMENT soumis à la RLS.
--      Il est destiné à tout accès direct à la base : outils BI, requêtes manuelles,
--      exports, futurs workers restreints. C'est la défense en profondeur : même
--      avec une requête sans clause merchant_id, PostgreSQL refuse les lignes des
--      autres marchands.
--
-- Le contexte utilisateur est posé par transaction :
--   SELECT set_config('app.current_user_id', '<user id>', true);
-- (voir withRlsUser() dans src/server/db/index.ts)
--
-- Rappel de parité : les drapeaux booléens sont stockés en integer 0/1.

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$;

-- SECURITY DEFINER : ces fonctions doivent lire users / merchant_users même
-- lorsque l'appelant est restreint par la RLS sur ces mêmes tables.
CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT u.is_super_admin = 1 FROM users u WHERE u.id = app_current_user_id()),
    false
  )
$$;

CREATE OR REPLACE FUNCTION app_is_member(target_merchant text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT app_is_super_admin() OR EXISTS (
    SELECT 1 FROM merchant_users mu
    WHERE mu.merchant_id = target_merchant
      AND mu.user_id = app_current_user_id()
      AND mu.status = 'active'
  )
$$;

-- Tables portant merchant_id : politique unique d'isolation par tenant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'merchants','merchant_users','subscriptions','usage_records','customers','orders','order_items',
    'order_events','delivery_connections','delivery_shipments','delivery_events','whatsapp_connections',
    'whatsapp_conversations','whatsapp_messages','whatsapp_templates','automations','automation_runs',
    'integrations','notifications','notification_preferences','customer_consents','webhook_events',
    'api_logs','audit_logs','provider_requests'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    IF t = 'merchants' THEN
      EXECUTE 'CREATE POLICY tenant_isolation ON merchants USING (app_is_member(id)) WITH CHECK (app_is_member(id))';
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (app_is_member(merchant_id)) WITH CHECK (app_is_member(merchant_id))',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Un utilisateur ne lit que sa propre fiche ; les super admins voient tout.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_access ON users;
CREATE POLICY self_access ON users
  USING (id = app_current_user_id() OR app_is_super_admin())
  WITH CHECK (id = app_current_user_id() OR app_is_super_admin());

-- Tables purement plateforme : réservées aux super admins.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jobs','leads','sessions_revoked']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_only ON %I', t);
    EXECUTE format('CREATE POLICY platform_only ON %I USING (app_is_super_admin()) WITH CHECK (app_is_super_admin())', t);
  END LOOP;
END $$;

-- Les plans publics sont lisibles par tous (page tarifs), modifiables par les super admins.
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON plans;
DROP POLICY IF EXISTS plans_write ON plans;
CREATE POLICY plans_read ON plans FOR SELECT USING (is_public = 1 OR app_is_super_admin());
CREATE POLICY plans_write ON plans FOR ALL USING (app_is_super_admin()) WITH CHECK (app_is_super_admin());

-- ---------------------------------------------------------------------------
-- Rôle restreint soumis à la RLS.
-- Mot de passe fourni via psql -v tenant_password=... ; sinon rôle NOLOGIN.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'codwsap_tenant') THEN
    CREATE ROLE codwsap_tenant NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO codwsap_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO codwsap_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO codwsap_tenant;

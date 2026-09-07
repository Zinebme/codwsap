-- CODWSAP — Row Level Security.
--
-- Modèle : chaque entité métier porte merchant_id. Un utilisateur n'accède qu'aux
-- lignes des marchands dont il est membre actif. Les super admins ont un accès
-- transverse. L'application résout de toute façon le tenant côté serveur : la RLS
-- est une seconde barrière, pas la seule.
--
-- `app.current_user_id` est positionné par la couche serveur au début de chaque
-- transaction (SET LOCAL app.current_user_id = '<user id>').

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((SELECT u.is_super_admin FROM users u WHERE u.id = app_current_user_id()), false)
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

-- Tables portant merchant_id : politique unique de tenancy.
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
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
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
ALTER TABLE users FORCE ROW LEVEL SECURITY;
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
CREATE POLICY plans_read ON plans FOR SELECT USING (is_public OR app_is_super_admin());
CREATE POLICY plans_write ON plans FOR ALL USING (app_is_super_admin()) WITH CHECK (app_is_super_admin());

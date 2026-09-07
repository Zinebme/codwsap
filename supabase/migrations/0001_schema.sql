-- CODWSAP — schéma Postgres / Supabase (référence de production).
-- Miroir de src/server/db/schema.sql (driver portable de développement).
-- Les politiques RLS sont dans 0002_rls.sql.


CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price_dzd integer NOT NULL DEFAULT 0,
  max_orders_month integer NOT NULL DEFAULT 0,
  max_messages_month integer NOT NULL DEFAULT 0,
  max_team_members integer NOT NULL DEFAULT 0,
  max_delivery_connections integer NOT NULL DEFAULT 0,
  max_automations integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'trial', -- trial | active | suspended | cancelled
  plan_code text NOT NULL DEFAULT 'trial',
  phone text,
  email text,
  wilaya text,
  address text,
  currency text NOT NULL DEFAULT 'DZD',
  locale text NOT NULL DEFAULT 'fr',
  timezone text NOT NULL DEFAULT 'Africa/Algiers',
  onboarding_step integer NOT NULL DEFAULT 1,
  onboarding_completed_at timestamptz,
  trial_ends_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  phone text,
  is_super_admin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_users (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent', -- owner | admin | agent
  status text NOT NULL DEFAULT 'active', -- active | invited | disabled
  invited_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_users_user ON merchant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_users_merchant ON merchant_users(merchant_id, role);

CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  status text NOT NULL DEFAULT 'trialing', -- trialing | active | past_due | cancelled
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end timestamptz,
  activated_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant ON subscriptions(merchant_id, status);

CREATE TABLE IF NOT EXISTS usage_records (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  period text NOT NULL, -- YYYY-MM
  metric text NOT NULL, -- orders | messages | delivery_api_calls
  value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, period, metric)
);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  full_name text,
  original_phone text NOT NULL,
  normalized_phone text NOT NULL, -- E.164
  wilaya text,
  commune text,
  whatsapp_status text NOT NULL DEFAULT 'unknown', -- available | unavailable | unknown | check_failed
  whatsapp_checked_at timestamptz,
  whatsapp_check_source text,
  opt_in_status text NOT NULL DEFAULT 'unknown', -- opted_in | unknown
  opt_in_date timestamptz,
  opt_in_source text,
  opt_out_status integer NOT NULL DEFAULT 0,
  opt_out_date timestamptz,
  total_orders integer NOT NULL DEFAULT 0,
  delivered_orders integer NOT NULL DEFAULT 0,
  cancelled_orders integer NOT NULL DEFAULT 0,
  returned_orders integer NOT NULL DEFAULT 0,
  total_cod_value integer NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  last_interaction_at timestamptz,
  notes text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, normalized_phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_merchant_phone ON customers(merchant_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_customers_merchant_created ON customers(merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  reference text NOT NULL,
  external_id text,
  source text NOT NULL DEFAULT 'manual', -- manual | google_sheets | webhook | api | csv
  source_id text,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  original_phone text,
  normalized_phone text,
  wilaya text,
  commune text,
  address text,
  delivery_type text NOT NULL DEFAULT 'home', -- home | office
  products_price integer NOT NULL DEFAULT 0,
  delivery_price integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'new',
  delivery_status text NOT NULL DEFAULT 'pending',
  whatsapp_status text NOT NULL DEFAULT 'none', -- none | queued | sent | delivered | read | failed | replied
  assigned_user_id text REFERENCES users(id) ON DELETE SET NULL,
  delivery_connection_id text,
  delivery_provider text,
  tracking_number text,
  notes text,
  confirmed_at timestamptz,
  postponed_until text,
  last_message_at timestamptz,
  last_reply_at timestamptz,
  attention integer NOT NULL DEFAULT 0,
  is_test boolean NOT NULL DEFAULT false,
  order_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_created ON orders(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_status ON orders(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_delivery ON orders(merchant_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_phone ON orders(merchant_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(merchant_id, tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_external ON orders(merchant_id, source, external_id);

CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  variant text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type text NOT NULL, -- status_change | note | message | delivery | automation | error | manual_action
  title text NOT NULL,
  description text,
  actor_id text,
  actor_label text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_connections (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider text NOT NULL, -- ecotrack | yalidine | zrexpress | navex | generic_webhook
  label text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected', -- connected | disconnected | error
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  credentials_encrypted text,
  settings text,
  status_mapping text,
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_connections_merchant ON delivery_connections(merchant_id, is_active);

CREATE TABLE IF NOT EXISTS delivery_shipments (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_connection_id text REFERENCES delivery_connections(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_order_id text,
  tracking_number text,
  raw_status text,
  normalized_status text NOT NULL DEFAULT 'created',
  label_url text,
  last_update text,
  raw_payload text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON delivery_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON delivery_shipments(merchant_id, tracking_number);

CREATE TABLE IF NOT EXISTS delivery_events (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  shipment_id text REFERENCES delivery_shipments(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  raw_status text,
  normalized_status text NOT NULL,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw_payload text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_events_idem ON delivery_events(merchant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_delivery_events_order ON delivery_events(order_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'meta_cloud',
  display_phone text,
  phone_number_id text,
  business_account_id text,
  credentials_encrypted text,
  webhook_verify_token text,
  webhook_secret text,
  status text NOT NULL DEFAULT 'disconnected',
  quality_rating text,
  meta_metrics text,
  last_webhook_at timestamptz,
  last_message_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id text REFERENCES customers(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  normalized_phone text NOT NULL,
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  window_expires_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, normalized_phone)
);
CREATE INDEX IF NOT EXISTS idx_conversations_merchant ON whatsapp_conversations(merchant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id text REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  direction text NOT NULL, -- inbound | outbound
  kind text NOT NULL DEFAULT 'text', -- text | template | button_reply | system
  template_id text,
  template_name text,
  body text,
  payload text,
  status text NOT NULL DEFAULT 'queued', -- queued | sent | delivered | read | failed | rejected | received
  error_code text,
  error_message text,
  wa_message_id text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  automation_id text,
  dedupe_key text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_merchant_created ON whatsapp_messages(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON whatsapp_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_status ON whatsapp_messages(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_order ON whatsapp_messages(order_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedupe ON whatsapp_messages(merchant_id, dedupe_key);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'utility', -- utility | marketing | authentication
  language text NOT NULL DEFAULT 'fr',
  status text NOT NULL DEFAULT 'draft', -- draft | pending | approved | rejected | paused
  body text NOT NULL,
  variables text,
  buttons text,
  event_key text,
  quality text,
  meta_template_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, name, language)
);
CREATE INDEX IF NOT EXISTS idx_templates_merchant ON whatsapp_templates(merchant_id, status);

CREATE TABLE IF NOT EXISTS automations (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type text NOT NULL, -- new_order_confirmation | reply_yes_confirm | reply_no_cancel | shipped_notice | at_office_notice | out_for_delivery_notice | delivered_thanks | no_response_reminder | failed_message_alert
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  template_id text REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  config text,
  cooldown_minutes integer NOT NULL DEFAULT 180,
  delay_minutes integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_status text,
  run_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  suppressed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, type)
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  automation_id text REFERENCES automations(id) ON DELETE CASCADE,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  trigger text NOT NULL,
  result text NOT NULL, -- sent | suppressed | failed | skipped
  reason text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_merchant ON automation_runs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integrations (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  kind text NOT NULL, -- google_sheets | telegram | webhook | api
  label text,
  status text NOT NULL DEFAULT 'disconnected',
  credentials_encrypted text,
  settings text,
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integrations_merchant ON integrations(merchant_id, kind);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info', -- info | success | warning | error
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_merchant ON notifications(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(merchant_id, read_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  dashboard boolean NOT NULL DEFAULT true,
  telegram boolean NOT NULL DEFAULT false,
  email boolean NOT NULL DEFAULT false,
  UNIQUE (merchant_id, event_type)
);

CREATE TABLE IF NOT EXISTS customer_consents (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  action text NOT NULL, -- opt_in | opt_out
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consents_customer ON customer_consents(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  merchant_id text REFERENCES merchants(id) ON DELETE CASCADE,
  source text NOT NULL, -- whatsapp | delivery | order_source
  provider text,
  idempotency_key text,
  signature_valid integer,
  status text NOT NULL DEFAULT 'received', -- received | processed | duplicate | failed
  error text,
  payload text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_idem ON webhook_events(source, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhook_merchant ON webhook_events(merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_logs (
  id text PRIMARY KEY,
  merchant_id text REFERENCES merchants(id) ON DELETE CASCADE,
  service text NOT NULL,
  operation text NOT NULL,
  status_code integer,
  ok boolean NOT NULL DEFAULT true,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_logs_merchant ON api_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_service ON api_logs(service, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  merchant_id text REFERENCES merchants(id) ON DELETE CASCADE,
  actor_id text,
  actor_label text,
  action text NOT NULL,
  resource text,
  resource_id text,
  ip text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  merchant_id text REFERENCES merchants(id) ON DELETE CASCADE,
  type text NOT NULL, -- send_whatsapp | poll_delivery | sync_sheet | reminder | notify_telegram
  payload text,
  status text NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, run_after);

CREATE TABLE IF NOT EXISTS provider_requests (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  contact text,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions_revoked (
  jti text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- Default plans (idempotent). Limits are enforced server-side.
INSERT INTO plans (id, code, name, price_dzd, max_orders_month, max_messages_month, max_team_members, max_delivery_connections, max_automations, is_public, sort_order)
VALUES
  ('plan_trial',   'trial',   'Essai',   0,     200,   500,   2,  1, 9, true, 1),
  ('plan_starter', 'starter', 'Starter', 4900,  2000,  10000, 5,  2, 9, true, 2),
  ('plan_pro',     'pro',     'Pro',     9900,  10000, 50000, 15, 5, 9, true, 3)
ON CONFLICT (code) DO NOTHING;

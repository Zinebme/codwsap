-- Portable core schema (SQLite dialect used by the embedded dev/self-host driver).
-- The canonical Postgres/Supabase version (with RLS) lives in supabase/migrations.
-- Keep both in sync: same table names, same columns, same indexes.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price_dzd INTEGER NOT NULL DEFAULT 0,
  max_orders_month INTEGER NOT NULL DEFAULT 0,
  max_messages_month INTEGER NOT NULL DEFAULT 0,
  max_team_members INTEGER NOT NULL DEFAULT 0,
  max_delivery_connections INTEGER NOT NULL DEFAULT 0,
  max_automations INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial', -- trial | active | suspended | cancelled
  plan_code TEXT NOT NULL DEFAULT 'trial',
  phone TEXT,
  email TEXT,
  wilaya TEXT,
  address TEXT,
  currency TEXT NOT NULL DEFAULT 'DZD',
  locale TEXT NOT NULL DEFAULT 'fr',
  timezone TEXT NOT NULL DEFAULT 'Africa/Algiers',
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  onboarding_completed_at TEXT,
  trial_ends_at TEXT,
  last_active_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS merchant_users (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'agent', -- owner | admin | agent
  status TEXT NOT NULL DEFAULT 'active', -- active | invited | disabled
  invited_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_users_user ON merchant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_users_merchant ON merchant_users(merchant_id, role);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trialing', -- trialing | active | past_due | cancelled
  period_start TEXT NOT NULL DEFAULT (datetime('now')),
  period_end TEXT,
  activated_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant ON subscriptions(merchant_id, status);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- YYYY-MM
  metric TEXT NOT NULL, -- orders | messages | delivery_api_calls
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id, period, metric)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  full_name TEXT,
  original_phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL, -- E.164
  wilaya TEXT,
  commune TEXT,
  whatsapp_status TEXT NOT NULL DEFAULT 'unknown', -- available | unavailable | unknown | check_failed
  whatsapp_checked_at TEXT,
  whatsapp_check_source TEXT,
  opt_in_status TEXT NOT NULL DEFAULT 'unknown', -- opted_in | unknown
  opt_in_date TEXT,
  opt_in_source TEXT,
  opt_out_status INTEGER NOT NULL DEFAULT 0,
  opt_out_date TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  delivered_orders INTEGER NOT NULL DEFAULT 0,
  cancelled_orders INTEGER NOT NULL DEFAULT 0,
  returned_orders INTEGER NOT NULL DEFAULT 0,
  total_cod_value INTEGER NOT NULL DEFAULT 0,
  last_order_at TEXT,
  last_interaction_at TEXT,
  notes TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id, normalized_phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_merchant_phone ON customers(merchant_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_customers_merchant_created ON customers(merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- manual | google_sheets | webhook | api | csv
  source_id TEXT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  original_phone TEXT,
  normalized_phone TEXT,
  wilaya TEXT,
  commune TEXT,
  address TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'home', -- home | office
  products_price INTEGER NOT NULL DEFAULT 0,
  delivery_price INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'new',
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  whatsapp_status TEXT NOT NULL DEFAULT 'none', -- none | queued | sent | delivered | read | failed | replied
  assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  delivery_connection_id TEXT,
  delivery_provider TEXT,
  tracking_number TEXT,
  notes TEXT,
  confirmed_at TEXT,
  postponed_until TEXT,
  last_message_at TEXT,
  last_reply_at TEXT,
  attention INTEGER NOT NULL DEFAULT 0,
  is_test INTEGER NOT NULL DEFAULT 0,
  order_date TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_created ON orders(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_status ON orders(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_delivery ON orders(merchant_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_phone ON orders(merchant_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(merchant_id, tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_external ON orders(merchant_id, source, external_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  variant TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- status_change | note | message | delivery | automation | error | manual_action
  title TEXT NOT NULL,
  description TEXT,
  actor_id TEXT,
  actor_label TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_connections (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- ecotrack | yalidine | zrexpress | navex | generic_webhook
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected', -- connected | disconnected | error
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  credentials_encrypted TEXT,
  settings TEXT,
  status_mapping TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_delivery_connections_merchant ON delivery_connections(merchant_id, is_active);

CREATE TABLE IF NOT EXISTS delivery_shipments (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_connection_id TEXT REFERENCES delivery_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_order_id TEXT,
  tracking_number TEXT,
  raw_status TEXT,
  normalized_status TEXT NOT NULL DEFAULT 'created',
  label_url TEXT,
  last_update TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON delivery_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON delivery_shipments(merchant_id, tracking_number);

CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  shipment_id TEXT REFERENCES delivery_shipments(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  raw_status TEXT,
  normalized_status TEXT NOT NULL,
  note TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_payload TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_events_idem ON delivery_events(merchant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_delivery_events_order ON delivery_events(order_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta_cloud',
  display_phone TEXT,
  phone_number_id TEXT,
  business_account_id TEXT,
  credentials_encrypted TEXT,
  webhook_verify_token TEXT,
  webhook_secret TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  quality_rating TEXT,
  meta_metrics TEXT,
  last_webhook_at TEXT,
  last_message_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  normalized_phone TEXT NOT NULL,
  last_message_at TEXT,
  last_message_preview TEXT,
  last_inbound_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  window_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id, normalized_phone)
);
CREATE INDEX IF NOT EXISTS idx_conversations_merchant ON whatsapp_conversations(merchant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  direction TEXT NOT NULL, -- inbound | outbound
  kind TEXT NOT NULL DEFAULT 'text', -- text | template | button_reply | system
  template_id TEXT,
  template_name TEXT,
  body TEXT,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | sent | delivered | read | failed | rejected | received
  error_code TEXT,
  error_message TEXT,
  wa_message_id TEXT,
  queued_at TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  automation_id TEXT,
  dedupe_key TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_merchant_created ON whatsapp_messages(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON whatsapp_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_status ON whatsapp_messages(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_order ON whatsapp_messages(order_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedupe ON whatsapp_messages(merchant_id, dedupe_key);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'utility', -- utility | marketing | authentication
  language TEXT NOT NULL DEFAULT 'fr',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | pending | approved | rejected | paused
  body TEXT NOT NULL,
  variables TEXT,
  buttons TEXT,
  event_key TEXT,
  quality TEXT,
  meta_template_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id, name, language)
);
CREATE INDEX IF NOT EXISTS idx_templates_merchant ON whatsapp_templates(merchant_id, status);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- new_order_confirmation | reply_yes_confirm | reply_no_cancel | shipped_notice | at_office_notice | out_for_delivery_notice | delivered_thanks | no_response_reminder | failed_message_alert
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  template_id TEXT REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  config TEXT,
  cooldown_minutes INTEGER NOT NULL DEFAULT 180,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_status TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  suppressed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (merchant_id, type)
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  automation_id TEXT REFERENCES automations(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  result TEXT NOT NULL, -- sent | suppressed | failed | skipped
  reason TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_merchant ON automation_runs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- google_sheets | telegram | webhook | api
  label TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  credentials_encrypted TEXT,
  settings TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_integrations_merchant ON integrations(merchant_id, kind);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- info | success | warning | error
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_merchant ON notifications(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(merchant_id, read_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  dashboard INTEGER NOT NULL DEFAULT 1,
  telegram INTEGER NOT NULL DEFAULT 0,
  email INTEGER NOT NULL DEFAULT 0,
  UNIQUE (merchant_id, event_type)
);

CREATE TABLE IF NOT EXISTS customer_consents (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  action TEXT NOT NULL, -- opt_in | opt_out
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consents_customer ON customer_consents(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- whatsapp | delivery | order_source
  provider TEXT,
  idempotency_key TEXT,
  signature_valid INTEGER,
  status TEXT NOT NULL DEFAULT 'received', -- received | processed | duplicate | failed
  error TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_idem ON webhook_events(source, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhook_merchant ON webhook_events(merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_logs (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  operation TEXT NOT NULL,
  status_code INTEGER,
  ok INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_logs_merchant ON api_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_service ON api_logs(service, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE CASCADE,
  actor_id TEXT,
  actor_label TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  ip TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- send_whatsapp | poll_delivery | sync_sheet | reminder | notify_telegram
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, run_after);

CREATE TABLE IF NOT EXISTS provider_requests (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  contact TEXT,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions_revoked (
  jti TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default plans (idempotent). Limits are enforced server-side.
INSERT OR IGNORE INTO plans (id, code, name, price_dzd, max_orders_month, max_messages_month, max_team_members, max_delivery_connections, max_automations, is_public, sort_order)
VALUES
  ('plan_trial',   'trial',   'Essai',   0,     200,   500,   2,  1, 9, 1, 1),
  ('plan_starter', 'starter', 'Starter', 4900,  2000,  10000, 5,  2, 9, 1, 2),
  ('plan_pro',     'pro',     'Pro',     9900,  10000, 50000, 15, 5, 9, 1, 3);

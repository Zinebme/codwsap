export type ServiceState = {
  state: "healthy" | "degraded" | "down";
  calls?: number;
  failures?: number;
  pending?: number;
  failed?: number;
  stuck?: number;
};

export type Health = {
  kpi: {
    merchants: number; active: number; trial: number; suspended: number;
    orders: number; messages: number; failedMessages: number; deliveryCalls: number;
    integrationErrors: number; webhookErrors: number; automationFailures: number;
  };
  services: Record<string, ServiceState>;
  recentErrors: { service: string; operation: string; error: string | null; created_at: string; merchant_name: string | null }[];
  failedWebhooks: { id: string; source: string; event_type: string | null; error: string | null; created_at: string; merchant_name: string | null }[];
  providerRequests: { id: string; provider_name: string; contact: string | null; details: string | null; created_at: string; merchant_name: string | null }[];
  audits: { id: string; action: string; actor_label: string | null; resource: string | null; ip: string | null; created_at: string; merchant_name: string | null }[];
  plans: Plan[];
};

export type Plan = {
  code: string; name: string; price_dzd: number; max_orders_month: number; max_messages_month: number;
  max_team_members: number; max_delivery_connections: number; max_automations: number; sort_order: number;
};

export type MerchantRow = {
  id: string; name: string; email: string | null; phone: string | null; status: string; plan_code: string;
  created_at: string; owner_name: string | null; orders_count: number; messages_count: number;
  errors_count: number; whatsapp_status: string | null; delivery_provider: string | null;
};

import "server-only";
import type { DeliveryStatus } from "@/lib/domain";
import { decryptSecret } from "@/server/crypto";
import { get } from "@/server/db";
import { apiLog } from "@/server/services/audit";
import type {
  ConnectorCapabilities,
  DeliveryConnector,
  ShipmentInput,
  ShipmentResult,
  TestResult,
  TrackingResult,
} from "./types";

export type { DeliveryConnector, ShipmentInput, TrackingResult } from "./types";

type Creds = Record<string, string>;

function normalizeByKeywords(raw: string): DeliveryStatus {
  const s = (raw || "").toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));
  if (has("livré", "livre", "delivered", "تم التسليم", "termine")) return "delivered";
  if (has("retour", "return", "مرتجع")) return "returned";
  if (has("echec", "échec", "failed", "annul", "reporté", "reporte")) return "delivery_failed";
  if (has("sorti", "out for delivery", "en cours de livraison", "distribution")) return "out_for_delivery";
  if (has("agence", "bureau", "desk", "stopdesk", "centre")) return "at_agency";
  if (has("transit", "route", "dispatch", "transfert")) return "in_transit";
  if (has("expedi", "expédi", "shipped", "ramass", "pickup", "collecte")) return "shipped";
  if (has("accept", "valid", "confirm")) return "accepted";
  if (has("créé", "cree", "created", "nouveau", "pending", "en préparation")) return "created";
  return "submitted";
}

/**
 * Base HTTP connector. Concrete Algerian providers differ mostly by endpoint
 * paths, auth header and status vocabulary, so they subclass this.
 */
abstract class BaseHttpConnector implements DeliveryConnector {
  abstract readonly provider: string;
  abstract readonly label: string;
  abstract readonly capabilities: ConnectorCapabilities;
  abstract readonly credentialFields: DeliveryConnector["credentialFields"];
  protected abstract baseUrl(): string;
  protected abstract authHeaders(): Record<string, string>;
  protected abstract createPath(): string;
  protected abstract trackPath(tracking: string): string;
  protected abstract mapCreateBody(input: ShipmentInput): unknown;
  protected abstract readCreateResponse(json: unknown): { externalOrderId: string; trackingNumber: string | null } | null;
  protected abstract readTrackResponse(json: unknown): { rawStatus: string; updatedAt?: string } | null;

  constructor(protected creds: Creds, protected merchantId: string, protected mapping: Record<string, DeliveryStatus> = {}) {}

  normalizeStatus(raw: string): DeliveryStatus {
    const direct = this.mapping[(raw || "").toLowerCase().trim()];
    return direct ?? normalizeByKeywords(raw);
  }

  protected async request(path: string, init: RequestInit, operation: string) {
    const started = Date.now();
    const url = path.startsWith("http") ? path : `${this.baseUrl().replace(/\/$/, "")}${path}`;
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...this.authHeaders(), ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 500) };
      }
      await apiLog({
        merchantId: this.merchantId,
        service: `delivery:${this.provider}`,
        operation,
        statusCode: res.status,
        ok: res.ok,
        durationMs: Date.now() - started,
        error: res.ok ? null : `HTTP ${res.status}`,
      });
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      await apiLog({
        merchantId: this.merchantId,
        service: `delivery:${this.provider}`,
        operation,
        ok: false,
        durationMs: Date.now() - started,
        error: (e as Error).message,
      });
      return { ok: false, status: 0, json: null as unknown };
    }
  }

  async testConnection(): Promise<TestResult> {
    const missing = this.credentialFields.filter((f) => f.required && !this.creds[f.key]);
    if (missing.length) {
      return { ok: false, message: `Identifiants manquants : ${missing.map((m) => m.label).join(", ")}.` };
    }
    const res = await this.request(this.trackPath("TEST-CONNECTION"), { method: "GET" }, "test_connection");
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Identifiants refusés par le transporteur. Vérifiez votre clé API." };
    }
    if (res.status === 0) return { ok: false, message: "Transporteur injoignable. Réessayez dans quelques minutes." };
    return { ok: true, message: "Connexion établie avec le transporteur." };
  }

  async createShipment(input: ShipmentInput): Promise<ShipmentResult> {
    if (!this.capabilities.supportsCreateShipment) return { ok: false, error: "Ce transporteur ne supporte pas la création d'expédition." };
    const res = await this.request(this.createPath(), { method: "POST", body: JSON.stringify(this.mapCreateBody(input)) }, "create_shipment");
    if (!res.ok) return { ok: false, error: "Le transporteur a refusé la création du colis.", raw: res.json };
    const parsed = this.readCreateResponse(res.json);
    if (!parsed) return { ok: false, error: "Réponse inattendue du transporteur.", raw: res.json };
    return { ok: true, externalOrderId: parsed.externalOrderId, trackingNumber: parsed.trackingNumber, raw: res.json };
  }

  async track(trackingNumber: string): Promise<TrackingResult> {
    if (!this.capabilities.supportsTracking) return { ok: false, error: "Suivi non supporté par ce transporteur." };
    const res = await this.request(this.trackPath(trackingNumber), { method: "GET" }, "track");
    if (!res.ok) return { ok: false, error: "Suivi indisponible pour le moment." };
    const parsed = this.readTrackResponse(res.json);
    if (!parsed) return { ok: false, error: "Statut illisible renvoyé par le transporteur." };
    return {
      ok: true,
      rawStatus: parsed.rawStatus,
      normalizedStatus: this.normalizeStatus(parsed.rawStatus),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      raw: res.json,
    };
  }
}

/* --------------------------- EcoTrack-compatible -------------------------- */
class EcotrackConnector extends BaseHttpConnector {
  readonly provider = "ecotrack";
  readonly label = "EcoTrack (compatible)";
  readonly capabilities: ConnectorCapabilities = {
    supportsCreateShipment: true,
    supportsUpdateShipment: true,
    supportsCancelShipment: false,
    supportsTracking: true,
    supportsWebhooks: true,
    supportsStatusPolling: true,
  };
  readonly credentialFields = [
    { key: "base_url", label: "URL de la plateforme", type: "url" as const, required: true, help: "Ex : https://votre-societe.ecotrack.dz" },
    { key: "api_token", label: "Jeton API", type: "password" as const, required: true },
    { key: "user_guid", label: "User GUID", type: "text" as const, required: false },
  ];
  protected baseUrl() {
    return this.creds.base_url || "https://app.ecotrack.dz";
  }
  protected authHeaders() {
    return { Authorization: `Bearer ${this.creds.api_token ?? ""}` };
  }
  protected createPath() {
    return "/api/v1/create/order";
  }
  protected trackPath(t: string) {
    return `/api/v1/get/tracking/info?tracking=${encodeURIComponent(t)}`;
  }
  protected mapCreateBody(i: ShipmentInput) {
    return {
      reference: i.reference,
      nom_client: i.customerName,
      telephone: i.phone,
      adresse: i.address ?? "",
      wilaya: i.wilaya,
      commune: i.commune,
      montant: i.total,
      produit: i.productsLabel,
      remarque: i.notes ?? "",
      type: i.deliveryType === "office" ? 2 : 1,
      user_guid: this.creds.user_guid,
    };
  }
  protected readCreateResponse(json: unknown) {
    const j = json as { tracking?: string; order_id?: string; id?: string };
    const tracking = j?.tracking ?? null;
    const id = j?.order_id ?? j?.id ?? tracking;
    return id ? { externalOrderId: String(id), trackingNumber: tracking } : null;
  }
  protected readTrackResponse(json: unknown) {
    const j = json as { status?: string; last_status?: string; updated_at?: string };
    const raw = j?.last_status ?? j?.status;
    return raw ? { rawStatus: String(raw), updatedAt: j?.updated_at } : null;
  }
  parseWebhook(body: unknown) {
    const b = body as { tracking?: string; status?: string; updated_at?: string };
    if (!b?.tracking || !b?.status) return [];
    return [
      {
        trackingNumber: String(b.tracking),
        rawStatus: String(b.status),
        normalizedStatus: this.normalizeStatus(String(b.status)),
        occurredAt: b.updated_at,
      },
    ];
  }
}

/* --------------------------------- Yalidine -------------------------------- */
class YalidineConnector extends BaseHttpConnector {
  readonly provider = "yalidine";
  readonly label = "Yalidine";
  readonly capabilities: ConnectorCapabilities = {
    supportsCreateShipment: true,
    supportsUpdateShipment: true,
    supportsCancelShipment: true,
    supportsTracking: true,
    supportsWebhooks: false,
    supportsStatusPolling: true,
  };
  readonly credentialFields = [
    { key: "api_id", label: "API ID", type: "text" as const, required: true },
    { key: "api_token", label: "API Token", type: "password" as const, required: true },
    { key: "from_wilaya", label: "Wilaya de départ", type: "text" as const, required: false },
  ];
  protected baseUrl() {
    return "https://api.yalidine.app/v1";
  }
  protected authHeaders() {
    return { "X-API-ID": this.creds.api_id ?? "", "X-API-TOKEN": this.creds.api_token ?? "" };
  }
  protected createPath() {
    return "/parcels/";
  }
  protected trackPath(t: string) {
    return `/parcels/?tracking=${encodeURIComponent(t)}`;
  }
  protected mapCreateBody(i: ShipmentInput) {
    return [
      {
        order_id: i.reference,
        firstname: i.customerName.split(" ")[0] ?? i.customerName,
        familyname: i.customerName.split(" ").slice(1).join(" ") || "-",
        contact_phone: i.phone.replace("+213", "0"),
        address: i.address ?? i.commune ?? "",
        to_wilaya_name: i.wilaya,
        to_commune_name: i.commune,
        product_list: i.productsLabel,
        price: i.total,
        is_stopdesk: i.deliveryType === "office",
        from_wilaya_name: this.creds.from_wilaya ?? "Alger",
        freeshipping: false,
      },
    ];
  }
  protected readCreateResponse(json: unknown) {
    const j = json as Record<string, { success?: boolean; tracking?: string; order_id?: string }>;
    const first = j && typeof j === "object" ? Object.values(j)[0] : null;
    if (!first?.tracking) return null;
    return { externalOrderId: String(first.order_id ?? first.tracking), trackingNumber: String(first.tracking) };
  }
  protected readTrackResponse(json: unknown) {
    const j = json as { data?: { last_status?: string; date_last_status?: string }[] };
    const row = j?.data?.[0];
    return row?.last_status ? { rawStatus: row.last_status, updatedAt: row.date_last_status } : null;
  }
  async cancelShipment(trackingNumber: string) {
    const res = await this.request(`/parcels/${encodeURIComponent(trackingNumber)}`, { method: "DELETE" }, "cancel_shipment");
    return res.ok ? { ok: true } : { ok: false, error: "Annulation refusée par Yalidine." };
  }
}

/* ------------------------------- ZR Express ------------------------------- */
class ZrExpressConnector extends BaseHttpConnector {
  readonly provider = "zrexpress";
  readonly label = "ZR Express";
  readonly capabilities: ConnectorCapabilities = {
    supportsCreateShipment: true,
    supportsUpdateShipment: false,
    supportsCancelShipment: false,
    supportsTracking: true,
    supportsWebhooks: false,
    supportsStatusPolling: true,
  };
  readonly credentialFields = [
    { key: "token", label: "Token", type: "password" as const, required: true },
    { key: "cle", label: "Clé", type: "password" as const, required: true },
  ];
  protected baseUrl() {
    return "https://procolis.com/api_v1";
  }
  protected authHeaders() {
    return { token: this.creds.token ?? "", key: this.creds.cle ?? "" };
  }
  protected createPath() {
    return "/add_colis";
  }
  protected trackPath(t: string) {
    return `/lire?Tracking=${encodeURIComponent(t)}`;
  }
  protected mapCreateBody(i: ShipmentInput) {
    return {
      Colis: [
        {
          Tracking: i.reference,
          TypeLivraison: i.deliveryType === "office" ? "1" : "0",
          TypeColis: "0",
          Confrimee: "1",
          Client: i.customerName,
          MobileA: i.phone.replace("+213", "0"),
          Adresse: i.address ?? "",
          IDWilaya: i.wilaya ?? "",
          Commune: i.commune ?? "",
          Total: String(i.total),
          Note: i.notes ?? "",
          TProduit: i.productsLabel,
        },
      ],
    };
  }
  protected readCreateResponse(json: unknown) {
    const j = json as { Colis?: { Tracking?: string }[] };
    const tracking = j?.Colis?.[0]?.Tracking;
    return tracking ? { externalOrderId: String(tracking), trackingNumber: String(tracking) } : null;
  }
  protected readTrackResponse(json: unknown) {
    const j = json as { Colis?: { Situation?: string; DateH?: string }[] };
    const row = j?.Colis?.[0];
    return row?.Situation ? { rawStatus: row.Situation, updatedAt: row.DateH } : null;
  }
}

/* ---------------------------------- Navex --------------------------------- */
class NavexConnector extends BaseHttpConnector {
  readonly provider = "navex";
  readonly label = "Navex";
  readonly capabilities: ConnectorCapabilities = {
    supportsCreateShipment: true,
    supportsUpdateShipment: false,
    supportsCancelShipment: false,
    supportsTracking: true,
    supportsWebhooks: false,
    supportsStatusPolling: true,
  };
  readonly credentialFields = [
    { key: "base_url", label: "URL API", type: "url" as const, required: true },
    { key: "api_key", label: "Clé API", type: "password" as const, required: true },
  ];
  protected baseUrl() {
    return this.creds.base_url || "https://api.navex.dz";
  }
  protected authHeaders() {
    return { "X-API-KEY": this.creds.api_key ?? "" };
  }
  protected createPath() {
    return "/orders";
  }
  protected trackPath(t: string) {
    return `/orders/${encodeURIComponent(t)}/tracking`;
  }
  protected mapCreateBody(i: ShipmentInput) {
    return {
      reference: i.reference,
      client: { name: i.customerName, phone: i.phone },
      destination: { wilaya: i.wilaya, commune: i.commune, address: i.address, stopdesk: i.deliveryType === "office" },
      amount: i.total,
      products: i.productsLabel,
    };
  }
  protected readCreateResponse(json: unknown) {
    const j = json as { id?: string; tracking?: string };
    return j?.id || j?.tracking ? { externalOrderId: String(j.id ?? j.tracking), trackingNumber: j.tracking ?? null } : null;
  }
  protected readTrackResponse(json: unknown) {
    const j = json as { status?: string; updated_at?: string };
    return j?.status ? { rawStatus: j.status, updatedAt: j.updated_at } : null;
  }
}

/* ---------------------------- Generic / webhook --------------------------- */
class GenericConnector extends BaseHttpConnector {
  readonly provider = "generic_webhook";
  readonly label = "Transporteur générique (API/webhook)";
  readonly capabilities: ConnectorCapabilities = {
    supportsCreateShipment: false,
    supportsUpdateShipment: false,
    supportsCancelShipment: false,
    supportsTracking: false,
    supportsWebhooks: true,
    supportsStatusPolling: false,
  };
  readonly credentialFields = [
    { key: "webhook_secret", label: "Secret webhook", type: "password" as const, required: true, help: "Utilisé pour valider la signature HMAC." },
  ];
  protected baseUrl() {
    return "https://example.invalid";
  }
  protected authHeaders() {
    return {};
  }
  protected createPath() {
    return "/";
  }
  protected trackPath() {
    return "/";
  }
  protected mapCreateBody() {
    return {};
  }
  protected readCreateResponse() {
    return null;
  }
  protected readTrackResponse() {
    return null;
  }
  async testConnection(): Promise<TestResult> {
    return this.creds.webhook_secret
      ? { ok: true, message: "Endpoint webhook prêt. Communiquez l'URL à votre transporteur." }
      : { ok: false, message: "Renseignez un secret webhook." };
  }
}

/** Sandbox connector used for test orders and demo merchants. */
class SandboxConnector extends BaseHttpConnector {
  readonly provider = "sandbox";
  readonly label = "Transporteur de test";
  readonly capabilities: ConnectorCapabilities = {
    supportsCreateShipment: true,
    supportsUpdateShipment: true,
    supportsCancelShipment: true,
    supportsTracking: true,
    supportsWebhooks: true,
    supportsStatusPolling: true,
  };
  readonly credentialFields = [];
  protected baseUrl() {
    return "https://sandbox.invalid";
  }
  protected authHeaders() {
    return {};
  }
  protected createPath() {
    return "/";
  }
  protected trackPath() {
    return "/";
  }
  protected mapCreateBody() {
    return {};
  }
  protected readCreateResponse() {
    return null;
  }
  protected readTrackResponse() {
    return null;
  }
  async testConnection(): Promise<TestResult> {
    return { ok: true, message: "Connecteur de test opérationnel." };
  }
  async createShipment(input: ShipmentInput): Promise<ShipmentResult> {
    const tracking = `TEST-${input.reference}`;
    return { ok: true, externalOrderId: tracking, trackingNumber: tracking, raw: { sandbox: true } };
  }
  async track(): Promise<TrackingResult> {
    return { ok: true, rawStatus: "En transit (test)", normalizedStatus: "in_transit", updatedAt: new Date().toISOString(), raw: { sandbox: true } };
  }
  async cancelShipment() {
    return { ok: true };
  }
}

export const DELIVERY_PROVIDERS = [
  { id: "ecotrack", label: "EcoTrack (compatible)", logoTone: "emerald" },
  { id: "yalidine", label: "Yalidine", logoTone: "blue" },
  { id: "zrexpress", label: "ZR Express", logoTone: "amber" },
  { id: "navex", label: "Navex", logoTone: "violet" },
  { id: "generic_webhook", label: "Transporteur générique", logoTone: "slate" },
  { id: "sandbox", label: "Transporteur de test", logoTone: "slate" },
] as const;

export function buildConnector(provider: string, creds: Creds, merchantId: string, mapping: Record<string, DeliveryStatus> = {}): DeliveryConnector {
  switch (provider) {
    case "ecotrack":
      return new EcotrackConnector(creds, merchantId, mapping);
    case "yalidine":
      return new YalidineConnector(creds, merchantId, mapping);
    case "zrexpress":
      return new ZrExpressConnector(creds, merchantId, mapping);
    case "navex":
      return new NavexConnector(creds, merchantId, mapping);
    case "sandbox":
      return new SandboxConnector(creds, merchantId, mapping);
    default:
      return new GenericConnector(creds, merchantId, mapping);
  }
}

export async function connectorForConnection(connectionId: string, merchantId: string): Promise<DeliveryConnector | null> {
  const conn = await get<{ id: string; provider: string; credentials_encrypted: string | null; status_mapping: string | null }>(
    "SELECT id, provider, credentials_encrypted, status_mapping FROM delivery_connections WHERE id = ? AND merchant_id = ?",
    [connectionId, merchantId],
  );
  if (!conn) return null;
  const creds = decryptSecret<Creds>(conn.credentials_encrypted) ?? {};
  let mapping: Record<string, DeliveryStatus> = {};
  try {
    mapping = conn.status_mapping ? JSON.parse(conn.status_mapping) : {};
  } catch {
    mapping = {};
  }
  return buildConnector(conn.provider, creds, merchantId, mapping);
}

export function capabilitiesOf(provider: string): ConnectorCapabilities {
  return buildConnector(provider, {}, "x").capabilities;
}

export function credentialFieldsOf(provider: string) {
  return buildConnector(provider, {}, "x").credentialFields;
}

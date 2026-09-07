import type { DeliveryStatus } from "@/lib/domain";

export type ConnectorCapabilities = {
  supportsCreateShipment: boolean;
  supportsUpdateShipment: boolean;
  supportsCancelShipment: boolean;
  supportsTracking: boolean;
  supportsWebhooks: boolean;
  supportsStatusPolling: boolean;
};

export type ShipmentInput = {
  reference: string;
  customerName: string;
  phone: string;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  deliveryType: "home" | "office";
  productsLabel: string;
  total: number;
  notes?: string | null;
};

export type ShipmentResult =
  | { ok: true; externalOrderId: string; trackingNumber: string | null; raw: unknown }
  | { ok: false; error: string; raw?: unknown };

export type TrackingResult =
  | { ok: true; rawStatus: string; normalizedStatus: DeliveryStatus; updatedAt: string; raw: unknown }
  | { ok: false; error: string };

export type TestResult = { ok: boolean; message: string; details?: unknown };

export interface DeliveryConnector {
  readonly provider: string;
  readonly label: string;
  readonly capabilities: ConnectorCapabilities;
  /** Credential fields the merchant must fill (rendered dynamically in the UI). */
  readonly credentialFields: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; help?: string }[];
  testConnection(): Promise<TestResult>;
  createShipment(input: ShipmentInput): Promise<ShipmentResult>;
  updateShipment?(trackingNumber: string, input: Partial<ShipmentInput>): Promise<ShipmentResult>;
  cancelShipment?(trackingNumber: string): Promise<{ ok: boolean; error?: string }>;
  track(trackingNumber: string): Promise<TrackingResult>;
  /** Map a provider-specific raw status into the internal normalized model. */
  normalizeStatus(raw: string): DeliveryStatus;
  /** Parse an inbound provider webhook into normalized events. */
  parseWebhook?(body: unknown): { trackingNumber: string; rawStatus: string; normalizedStatus: DeliveryStatus; occurredAt?: string }[];
}

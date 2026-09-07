import "server-only";
import { get, run, nowIso } from "@/server/db";
import { decryptSecret } from "@/server/crypto";
import { createOrder } from "@/server/services/orders";
import { apiLog } from "@/server/services/audit";
import { notify } from "@/server/services/notifications";

/**
 * Order-source connector layer. Google Sheets is ONE source among several
 * (webhook, REST API, CSV, manual). Column mapping is per-merchant — nothing
 * about any specific merchant's sheet layout is hardcoded.
 */

export type { ColumnMapping } from "./fields";
export { MAPPABLE_FIELDS } from "./fields";
import type { ColumnMapping } from "./fields";

export type ParsedRow = Record<string, string>;

export function rowsToOrders(merchantId: string, rows: ParsedRow[], mapping: ColumnMapping, source: string, sourceId?: string | null) {
  let created = 0;
  let duplicates = 0;
  let invalid = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const val = (key: keyof ColumnMapping) => {
      const col = mapping[key];
      if (!col) return "";
      return (row[col] ?? "").toString().trim();
    };
    const name = val("full_name");
    const phone = val("phone");
    if (!name || !phone) {
      invalid++;
      if (errors.length < 5) errors.push(`Ligne ${index + 2} : nom ou téléphone manquant.`);
      continue;
    }
    const productsPrice = num(val("products_price"));
    const deliveryPrice = num(val("delivery_price"));
    const totalPrice = num(val("total_price")) || productsPrice + deliveryPrice;
    const qty = Math.max(1, Math.round(num(val("quantity")) || 1));
    const place = val("delivery_place").toLowerCase();

    try {
      const res = createOrder({
        merchantId,
        externalId: val("order_id") || `${source}:${index}:${phone}`,
        source,
        sourceId: sourceId ?? null,
        customerName: name,
        phone,
        wilaya: val("wilaya") || null,
        commune: val("commune") || null,
        deliveryType: place.includes("bureau") || place.includes("desk") || place.includes("stop") ? "office" : "home",
        productsPrice,
        deliveryPrice,
        total: totalPrice,
        quantity: qty,
        items: val("product_name")
          ? [{ product_name: val("product_name"), variant: val("variant") || null, quantity: qty, unit_price: qty ? Math.round(productsPrice / qty) : productsPrice }]
          : [],
        orderDate: val("order_date") || undefined,
      });
      if (res.duplicated) duplicates++;
      else created++;
    } catch (e) {
      invalid++;
      if (errors.length < 5) errors.push(`Ligne ${index + 2} : ${(e as Error).message}`);
    }
  }
  return { created, duplicates, invalid, errors };
}

function num(v: string): number {
  const n = Number((v || "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const delim = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitLine(lines[0], delim);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, delim);
    const row: ParsedRow = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Google Sheets sync. Uses the published CSV export endpoint when the sheet is
 * shared by link, or the Sheets REST API with a server-stored API key. Google
 * credentials are stored encrypted server-side and never sent to the browser.
 */
export async function syncGoogleSheet(merchantId: string, integrationId: string) {
  const integ = get<{ id: string; settings: string | null; credentials_encrypted: string | null }>(
    "SELECT id, settings, credentials_encrypted FROM integrations WHERE id = ? AND merchant_id = ? AND kind = 'google_sheets'",
    [integrationId, merchantId],
  );
  if (!integ) return { ok: false as const, error: "Intégration Google Sheets introuvable." };

  const settings = safeJson<{ spreadsheet_id?: string; sheet_name?: string; gid?: string; mapping?: ColumnMapping }>(integ.settings) ?? {};
  const creds = decryptSecret<{ api_key?: string }>(integ.credentials_encrypted) ?? {};
  if (!settings.spreadsheet_id) return { ok: false as const, error: "Aucune feuille configurée." };

  const started = Date.now();
  let rows: ParsedRow[] = [];
  try {
    if (creds.api_key) {
      const range = encodeURIComponent(settings.sheet_name || "Sheet1");
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheet_id}/values/${range}?key=${creds.api_key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { values?: string[][] };
      const values = json.values ?? [];
      if (values.length > 1) {
        const headers = values[0];
        rows = values.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
      }
    } else {
      const gid = settings.gid ?? "0";
      const url = `https://docs.google.com/spreadsheets/d/${settings.spreadsheet_id}/export?format=csv&gid=${gid}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rows = parseCsv(await res.text());
    }
  } catch (e) {
    const error = `Synchronisation impossible : ${(e as Error).message}`;
    run("UPDATE integrations SET status = 'error', last_error = ?, last_error_at = ? WHERE id = ?", [error, nowIso(), integrationId]);
    apiLog({ merchantId, service: "google_sheets", operation: "sync", ok: false, durationMs: Date.now() - started, error });
    notify({ merchantId, type: "integration_disconnected", severity: "error", title: "Google Sheets : échec de synchronisation", body: error, link: "/dashboard/integrations" });
    return { ok: false as const, error };
  }

  const result = rowsToOrders(merchantId, rows, settings.mapping ?? {}, "google_sheets", integrationId);
  run("UPDATE integrations SET status = 'connected', last_sync_at = ?, last_error = NULL WHERE id = ?", [nowIso(), integrationId]);
  apiLog({ merchantId, service: "google_sheets", operation: "sync", ok: true, durationMs: Date.now() - started, statusCode: 200 });
  return { ok: true as const, ...result, scanned: rows.length };
}

export function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

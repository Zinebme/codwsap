/**
 * Algerian phone normalization.
 * Accepts 0550..., +213550..., 213550..., 00213550..., with spaces/dots/dashes.
 * Always keeps the original value; returns E.164 when confidently parseable.
 */

export type NormalizedPhone = {
  original: string;
  normalized: string;
  valid: boolean;
  kind: "mobile" | "landline" | "unknown";
};

export function normalizeDzPhone(input: string | null | undefined): NormalizedPhone {
  const original = (input ?? "").toString().trim();
  let d = original.replace(/[^\d+]/g, "");

  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (d.startsWith("+213")) d = `0${d.slice(4)}`;
  else if (d.startsWith("213") && d.length >= 11) d = `0${d.slice(3)}`;
  else if (d.startsWith("+")) {
    // Foreign number: keep as-is in E.164 if plausible.
    const ok = /^\+\d{8,15}$/.test(d);
    return { original, normalized: ok ? d : original, valid: ok, kind: "unknown" };
  }

  d = d.replace(/\D/g, "");
  if (d.length === 9 && /^[5679]/.test(d)) d = `0${d}`;

  if (/^0[5-7]\d{8}$/.test(d)) {
    return { original, normalized: `+213${d.slice(1)}`, valid: true, kind: "mobile" };
  }
  if (/^0[1-4|9]\d{7,8}$/.test(d)) {
    return { original, normalized: `+213${d.slice(1)}`, valid: true, kind: "landline" };
  }
  return { original, normalized: d ? `+213${d.replace(/^0/, "")}` : original, valid: false, kind: "unknown" };
}

/** Pretty display: +213 550 12 34 56 -> 0550 12 34 56 */
export function displayDzPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+213(\d{9})$/.exec(e164);
  if (!m) return e164;
  const n = `0${m[1]}`;
  return `${n.slice(0, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)} ${n.slice(8, 10)}`;
}

export function telHref(e164: string | null | undefined): string {
  return `tel:${(e164 ?? "").replace(/[^\d+]/g, "")}`;
}

export function waHref(e164: string | null | undefined): string {
  return `https://wa.me/${(e164 ?? "").replace(/\D/g, "")}`;
}

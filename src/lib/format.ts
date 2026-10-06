// Indian numbering & date formatting helpers.

export function inr(n: number): string {
  if (!isFinite(n)) return "₹0";
  const rounded = Math.round(n);
  return "₹" + rounded.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function inrDecimal(n: number): string {
  if (!isFinite(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDateDDMMYYYY(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0;
  const from = new Date(fromISO); const to = new Date(toISO);
  const ms = +to - +from;
  return Math.max(0, Math.round(ms / 86400000));
}

// Parse validity text like "01 Oct 22 - 30 Sep 23" or "01-Oct-2022 to 30-Sep-2023"
export function parseValidityRange(text: string): { start: string; end: string } | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  const sep = cleaned.split(/\s*(?:-|to|–|—|→)\s*/i);
  if (sep.length < 2) return null;
  const a = parseFlexibleDate(sep[0]); const b = parseFlexibleDate(sep[sep.length - 1]);
  if (!a || !b) return null;
  return { start: a, end: b };
}

export function parseFlexibleDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // Try native
  const native = new Date(t);
  if (!isNaN(+native) && native.getFullYear() > 1980) return native.toISOString().slice(0, 10);
  // "01 Oct 22" or "01-Oct-2022"
  const m = t.match(/(\d{1,2})[\s\-\/](\w{3,})[\s\-\/](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (mo !== undefined) {
      const dt = new Date(Date.UTC(y, mo, d));
      return dt.toISOString().slice(0, 10);
    }
  }
  // DD/MM/YYYY
  const m2 = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const d = parseInt(m2[1], 10); const mo = parseInt(m2[2], 10) - 1; let y = parseInt(m2[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, mo, d));
    return dt.toISOString().slice(0, 10);
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function serializeValidity(startISO: string, endISO: string): string {
  const f = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/,/g, "");
  };
  return `${f(startISO)} - ${f(endISO)}`;
}

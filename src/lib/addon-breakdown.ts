// Shared helpers to render itemized add-on breakdown (used by
// Final Costing page, Quote Document, and Excel export).
import type { SavedAddons } from "./quotes-store";

export interface AddonRow {
  detail: string;
  amount: number;
}
export interface AddonGroup {
  key: string;
  label: string;   // includes emoji
  rows: AddonRow[];
  total: number;
}

const PRICING_LABEL: Record<string, string> = {
  per_person: "Per Person",
  per_vehicle: "Per Vehicle",
  total_fixed: "Total Fixed",
};

export function buildAddonGroups(a: SavedAddons): AddonGroup[] {
  const groups: AddonGroup[] = [];

  if (a.travels.length) {
    const rows = a.travels.map((t) => ({
      detail: `${t.name} × ${t.days} day${t.days === 1 ? "" : "s"} × ${t.vehicles} vehicle${t.vehicles === 1 ? "" : "s"}`,
      amount: t.total,
    }));
    groups.push({ key: "travels", label: "🚌 Travels", rows, total: sum(rows) });
  }

  if (a.guide.length) {
    const rows = a.guide.map((g) => ({
      detail: `${g.name}${g.type ? ` (${g.type})` : ""} × ${g.days} day${g.days === 1 ? "" : "s"} × ${g.count} guide${g.count === 1 ? "" : "s"}`,
      amount: g.total,
    }));
    groups.push({ key: "guide", label: "🧭 Guide", rows, total: sum(rows) });
  }

  if (a.miscellaneous.length) {
    const rows = a.miscellaneous.map((m) => {
      let detail = m.name;
      if (m.unit === "per_person") detail += ` × ${m.pax} pax`;
      else if (m.unit === "per_day") detail += ` × ${m.pax || 0} day${(m.pax || 0) === 1 ? "" : "s"}`;
      else detail += " (fixed)";
      return { detail, amount: m.total };
    });
    groups.push({ key: "misc", label: "🛍 Miscellaneous", rows, total: sum(rows) });
  }

  if (a.entrances.length) {
    const rows = a.entrances.map((e) => {
      const parts: string[] = [];
      if (e.indian_pax > 0) parts.push(`${e.indian_pax} Indian × ₹${e.indian_rate}`);
      if (e.foreigner_pax > 0) parts.push(`${e.foreigner_pax} Foreigner × ₹${e.foreigner_rate}`);
      return {
        detail: `${e.site_name}${e.city ? `, ${e.city}` : ""} (${parts.join(" + ") || "—"})`,
        amount: e.total,
      };
    });
    groups.push({ key: "entrances", label: "🏛 Entrances", rows, total: sum(rows) });
  }

  if (a.activities.length) {
    const rows = a.activities.map((x) => ({
      detail: `${x.name} (${PRICING_LABEL[x.pricing_type] ?? x.pricing_type})`,
      amount: x.total,
    }));
    groups.push({ key: "activities", label: "🎯 Activity / Experience", rows, total: sum(rows) });
  }

  return groups;
}

function sum(rows: AddonRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

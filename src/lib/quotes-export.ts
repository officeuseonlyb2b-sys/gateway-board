// Excel export for saved quotes.
import * as XLSX from "xlsx";
import type { SavedQuote } from "./quotes-store";
import { getBranding } from "./branding";
import { inr } from "./format";

function safeName(s: string) { return (s || "").replace(/[^a-z0-9]+/gi, "_").slice(0, 60); }

function costSheetAOA(q: SavedQuote): (string | number)[][] {
  const b = getBranding();
  const rows: (string | number)[][] = [];
  rows.push([b.companyName]);
  rows.push([b.tagline]);
  rows.push([`Quote No: ${q.quote_number}`, "", "", `Saved By: ${q.saved_by}`, `Date: ${q.saved_at.slice(0, 10)}`]);
  rows.push([]);
  rows.push([`Tour: ${q.tour_title}`]);
  rows.push([`Duration: ${q.total_nights} Nights / ${q.total_nights + 1} Days`,
    "", "", `Dates: ${q.travel_start} → ${q.travel_end}`]);
  rows.push([]);
  rows.push(["Day", "Date", "City", "Hotel", "Category", "Room", "Meal", "SGL", "DBL", "TRP"]);
  q.itinerary.forEach((d) => {
    rows.push([d.day_number, d.date, d.city, d.hotel_name, d.hotel_category, d.room_category, d.meal_plan,
      d.rates.sgl_total, d.rates.dbl_total, d.rates.trp_total]);
  });
  rows.push([]);
  rows.push(["Net rate with GST", "", "", "", "", "", "",
    q.totals.room_net_sgl + q.totals.gst_rooms_sgl,
    q.totals.room_net_dbl + q.totals.gst_rooms_dbl,
    q.totals.room_net_trp + q.totals.gst_rooms_trp]);
  rows.push(["Add-Ons", "", "", "", "", "", "",
    q.totals.addons_total, q.totals.addons_total, q.totals.addons_total]);
  rows.push([`Mark Up ${q.markup_percent}%`, "", "", "", "", "", "",
    q.totals.markup_sgl, q.totals.markup_dbl, q.totals.markup_trp]);
  rows.push(["GST 5% (on Mark Up)", "", "", "", "", "", "",
    q.totals.gst_markup_sgl, q.totals.gst_markup_dbl, q.totals.gst_markup_trp]);
  rows.push(["GRAND TOTAL", "", "", "", "", "", "",
    q.totals.grand_sgl, q.totals.grand_dbl, q.totals.grand_trp]);

  const addAll = [
    ...q.addons.travels.map((t) => ["Travels", `${t.name} × ${t.days}d × ${t.vehicles}`, t.total]),
    ...q.addons.miscellaneous.map((m) => ["Miscellaneous", `${m.name} (${m.unit})`, m.total]),
    ...q.addons.guide.map((g) => ["Guide", `${g.name} × ${g.days}d × ${g.count}`, g.total]),
    ...q.addons.entrances.map((e) => ["Entrances", `${e.site_name}, ${e.city}`, e.total]),
    ...q.addons.activities.map((a) => ["Activity", `${a.name} (${a.pricing_type})`, a.total]),
  ];
  if (addAll.length) {
    rows.push([]);
    rows.push(["Add-Ons & Extras"]);
    rows.push(["Category", "Details", "Amount"]);
    addAll.forEach((r) => rows.push(r as (string | number)[]));
    rows.push(["", "Add-Ons Total", q.addons.addons_total]);
  }
  return rows;
}

function daywiseAOA(q: SavedQuote): (string | number)[][] {
  const header = ["Date", "City", "Hotel", "Category", "Room", "Meal",
    "SGL Net", "SGL GST%", "SGL GST Amt", "SGL Total",
    "DBL Net", "DBL GST%", "DBL GST Amt", "DBL Total",
    "TRP Net", "TRP GST%", "TRP GST Amt", "TRP Total"];
  const rows: (string | number)[][] = [header];
  q.itinerary.forEach((d) => {
    rows.push([d.date, d.city, d.hotel_name, d.hotel_category, d.room_category, d.meal_plan,
      d.rates.sgl_net, d.rates.sgl_gst_rate, d.rates.sgl_gst_amt, d.rates.sgl_total,
      d.rates.dbl_net, d.rates.dbl_gst_rate, d.rates.dbl_gst_amt, d.rates.dbl_total,
      d.rates.trp_net, d.rates.trp_gst_rate, d.rates.trp_gst_amt, d.rates.trp_total]);
  });
  return rows;
}

export function exportQuoteExcel(q: SavedQuote): void {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(costSheetAOA(q));
  ws1["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 14 },
    { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Cost Sheet");

  const ws2 = XLSX.utils.aoa_to_sheet(daywiseAOA(q));
  XLSX.utils.book_append_sheet(wb, ws2, "Day-wise Breakdown");

  const route = safeName(q.cities.join("-") || "Tour");
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Quote_${q.quote_number}_${route}_${date}.xlsx`);
}

export function exportAllQuotesExcel(list: SavedQuote[]): void {
  const wb = XLSX.utils.book_new();
  const summary = [
    ["Quote No", "Tour", "Nights", "Travel Start", "Travel End",
      "Grand SGL", "Grand DBL", "Grand TRP", "Saved By", "Saved At"],
    ...list.map((q) => [q.quote_number, q.tour_title, q.total_nights,
      q.travel_start, q.travel_end,
      q.totals.grand_sgl, q.totals.grand_dbl, q.totals.grand_trp,
      q.saved_by, q.saved_at.slice(0, 10)]),
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(summary);
  wsSum["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsSum, "Summary");

  list.forEach((q) => {
    const ws = XLSX.utils.aoa_to_sheet(costSheetAOA(q));
    // Sheet names limited to 31 chars, no []/*?:\/
    const nm = safeName(q.quote_number).slice(0, 31) || "Quote";
    XLSX.utils.book_append_sheet(wb, ws, nm);
  });

  XLSX.writeFile(wb, `MP_Tourism_All_Quotes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  void inr; // keep import
}

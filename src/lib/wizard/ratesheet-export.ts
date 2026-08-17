// Excel export for the Costing Rate Sheet (selected pax rows only).
import * as XLSX from "xlsx";

export interface RateSheetExportRow {
  vehicle: string;
  pax: number;
  transport: number;
  guide: number;
  escort: number;
  entrances: number;
  activities: number;
  misc: number;
  single: number;
  double: number;
  triple: number;
  quad: number;
  lunch: number;
  dinner: number;
  pkg_single: number;
  pkg_double: number;
  pkg_triple: number;
  pkg_quad: number;
}

export interface RateSheetExportMeta {
  title?: string;
  option?: string;
  landMarkup: number;
  landGst: number;
  hotelMarkup: number;
  hotelGst: number;
}

const HEADERS = [
  "Pax", "Vehicle",
  "Transport", "Guide", "Escort", "Entrances", "Activities", "Misc",
  "Single", "Double", "Triple", "Quad", "Lunch", "Dinner",
  "Pax", "Single Occ.", "Double Sharing", "Triple Sharing", "Quad Sharing",
];

const GROUP_HEADER = [
  "Land Part", ...Array(7).fill(""),
  "Accommodation Part", ...Array(5).fill(""),
  "Package Cost (Per Person)", ...Array(4).fill(""),
];

export function exportRateSheetExcel(
  rows: RateSheetExportRow[],
  meta: RateSheetExportMeta,
): void {
  const aoa: (string | number)[][] = [];
  aoa.push([meta.title || "Rate Sheet (Per Pax / Person)"]);
  if (meta.option) aoa.push([`Option: ${meta.option}`]);
  aoa.push([
    `Land Part — Markup ${meta.landMarkup}% · GST ${meta.landGst}%`,
    "", "", "",
    `Hotels & Meals — Markup ${meta.hotelMarkup}% · GST ${meta.hotelGst}%`,
  ]);
  aoa.push([]);
  aoa.push(GROUP_HEADER);
  aoa.push(HEADERS);

  let currentVehicle = "";
  rows.forEach((r) => {
    if (r.vehicle !== currentVehicle) {
      currentVehicle = r.vehicle;
      aoa.push([r.vehicle]);
    }
    aoa.push([
      r.pax, r.vehicle,
      r.transport, r.guide, r.escort, r.entrances, r.activities, r.misc,
      r.single, r.double, r.triple, r.quad, r.lunch, r.dinner,
      r.pax, r.pkg_single, r.pkg_double, r.pkg_triple, r.pkg_quad,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 }, { wch: 24 },
    ...Array(6).fill({ wch: 12 }),
    ...Array(6).fill({ wch: 12 }),
    { wch: 6 }, ...Array(4).fill({ wch: 15 }),
  ];

  // Currency format for numeric columns.
  const money = "#,##0;(#,##0);-";
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = 5; R <= range.e.r; R++) {
    for (let C = 2; C <= 18; C++) {
      if (C === 14) continue;
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && typeof cell.v === "number") cell.z = money;
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rate Sheet");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Rate_Sheet_${(meta.option || "Quote").replace(/[^a-z0-9]+/gi, "_")}_${stamp}.xlsx`);
}

// Print a specific DOM section in landscape.
export function printSection(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.add("printing-section");
  document.body.classList.add("costing-print-open");
  const cleanup = () => {
    el.classList.remove("printing-section");
    document.body.classList.remove("costing-print-open");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 1500);
}

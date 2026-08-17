// Excel export + single-page landscape printing
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
  "Pax",
  "Vehicle",
  "Transport",
  "Guide",
  "Escort",
  "Entrances",
  "Activities",
  "Misc",
  "Single",
  "Double",
  "Triple",
  "Quad",
  "Lunch",
  "Dinner",
  "Pax",
  "Single Occ.",
  "Double Sharing",
  "Triple Sharing",
  "Quad Sharing",
];

const GROUP_HEADER = [
  "Land Part",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "Accommodation Part",
  "",
  "",
  "",
  "",
  "Package Cost (Per Person)",
  "",
  "",
  "",
  "",
];

export function exportRateSheetExcel(
  rows: RateSheetExportRow[],
  meta: RateSheetExportMeta,
): void {
  const aoa: (string | number)[][] = [];

  aoa.push([meta.title || "Rate Sheet (Per Pax / Person)"]);

  if (meta.option) {
    aoa.push([`Option: ${meta.option}`]);
  }

  aoa.push([
    `Land Part — Markup ${meta.landMarkup}% · GST ${meta.landGst}%`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
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
      r.pax,
      r.vehicle,
      r.transport,
      r.guide,
      r.escort,
      r.entrances,
      r.activities,
      r.misc,
      r.single,
      r.double,
      r.triple,
      r.quad,
      r.lunch,
      r.dinner,
      r.pax,
      r.pkg_single,
      r.pkg_double,
      r.pkg_triple,
      r.pkg_quad,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  /*
   * Excel column widths
   */
  ws["!cols"] = [
    { wch: 6 },  // Pax
    { wch: 25 }, // Vehicle

    { wch: 12 }, // Transport
    { wch: 12 }, // Guide
    { wch: 12 }, // Escort
    { wch: 12 }, // Entrances
    { wch: 12 }, // Activities
    { wch: 12 }, // Misc

    { wch: 12 }, // Single
    { wch: 12 }, // Double
    { wch: 12 }, // Triple
    { wch: 12 }, // Quad
    { wch: 12 }, // Lunch
    { wch: 12 }, // Dinner

    { wch: 6 },  // Package Pax
    { wch: 15 }, // Single Occ
    { wch: 15 }, // Double Sharing
    { wch: 15 }, // Triple Sharing
    { wch: 15 }, // Quad Sharing
  ];

  /*
   * Currency format
   */
  const money = "#,##0;(#,##0);-";

  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);

    for (let R = 5; R <= range.e.r; R++) {
      for (let C = 2; C <= 18; C++) {
        // Pax column should not get currency formatting
        if (C === 14) continue;

        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];

        if (cell && typeof cell.v === "number") {
          cell.z = money;
        }
      }
    }
  }

  /*
   * Freeze header rows in Excel
   */
  ws["!freeze"] = {
    xSplit: 0,
    ySplit: 5,
  };

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    "Rate Sheet",
  );

  const stamp = new Date()
    .toISOString()
    .slice(0, 10);

  const safeOption = (meta.option || "Quote")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  XLSX.writeFile(
    wb,
    `Rate_Sheet_${safeOption}_${stamp}.xlsx`,
  );
}


/* ============================================================
   PRINT RATE SHEET
   ============================================================ */

export function printSection(
  el: HTMLElement | null,
): void {
  if (!el || typeof window === "undefined") {
    return;
  }

  /*
   * Remove previous print style if somehow left behind.
   */
  const oldStyle = document.getElementById(
    "costing-single-page-print-style",
  );

  oldStyle?.remove();

  /*
   * Mark only the requested section.
   */
  el.classList.add("printing-section");
  document.body.classList.add("costing-print-open");

  /*
   * Dedicated print CSS.
   *
   * IMPORTANT:
   * We are NOT opening another window.
   * We are NOT cloning the document.
   * We only temporarily change the existing page for printing.
   */
  const style = document.createElement("style");

  style.id = "costing-single-page-print-style";

  style.textContent = `
    @page {
      size: A4 landscape;
      margin: 5mm;
    }

    @media print {

      html,
      body {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: white !important;
      }

      body * {
        visibility: hidden !important;
      }

      body.costing-print-open
      .printing-section,
      body.costing-print-open
      .printing-section * {
        visibility: visible !important;
      }

      body.costing-print-open
      .printing-section {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;

        width: 100% !important;
        max-width: none !important;

        margin: 0 !important;
        padding: 0 !important;

        transform: none !important;

        overflow: visible !important;

        background: white !important;
      }

      /*
       * Prevent flex/grid containers from creating
       * unexpected extra print pages.
       */
      .printing-section,
      .printing-section > div,
      .printing-section table {
        max-width: 100% !important;
      }

      /*
       * Tables must stay together.
       */
      .printing-section table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;

        page-break-before: avoid !important;
        page-break-after: avoid !important;
        break-before: avoid !important;
        break-after: avoid !important;
      }

      .printing-section thead {
        display: table-header-group !important;
      }

      .printing-section tbody {
        display: table-row-group !important;
      }

      .printing-section tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .printing-section th,
      .printing-section td {
        padding: 2px 3px !important;

        font-size: 7px !important;
        line-height: 1.1 !important;

        white-space: nowrap !important;

        overflow: hidden !important;
        text-overflow: clip !important;
      }

      /*
       * Make vehicle column slightly wider.
       */
      .printing-section th:nth-child(2),
      .printing-section td:nth-child(2) {
        width: 16% !important;
      }

      /*
       * Remaining columns share the available width.
       */
      .printing-section th:not(:nth-child(2)),
      .printing-section td:not(:nth-child(2)) {
        width: auto !important;
      }

      /*
       * Hide buttons and interactive controls.
       */
      .printing-section button,
      .printing-section input,
      .printing-section select,
      .printing-section textarea,
      .printing-section [role="button"] {
        display: none !important;
      }

      /*
       * Remove unnecessary screen-only spacing.
       */
      .printing-section .space-y-1,
      .printing-section .space-y-2,
      .printing-section .space-y-3,
      .printing-section .space-y-4,
      .printing-section .space-y-5,
      .printing-section .space-y-6 {
        row-gap: 2px !important;
      }

      .printing-section .p-1,
      .printing-section .p-1\\.5,
      .printing-section .p-2,
      .printing-section .p-3,
      .printing-section .p-4 {
        padding: 2px !important;
      }

      .printing-section .gap-1,
      .printing-section .gap-2,
      .printing-section .gap-3,
      .printing-section .gap-4 {
        gap: 2px !important;
      }

      /*
       * Cards should not create independent pages.
       */
      .printing-section [class*="rounded"] {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      /*
       * Don't print shadows/background UI decorations.
       */
      .printing-section [class*="shadow"] {
        box-shadow: none !important;
      }

      /*
       * Hide horizontal scrollbar.
       */
      .printing-section .overflow-x-auto,
      .printing-section .overflow-auto,
      .printing-section .overflow-x-scroll {
        overflow: visible !important;
      }
    }
  `;

  document.head.appendChild(style);

  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;

    cleaned = true;

    window.removeEventListener(
      "afterprint",
      cleanup,
    );

    el.classList.remove("printing-section");
    document.body.classList.remove("costing-print-open");

    style.remove();
  };

  window.addEventListener(
    "afterprint",
    cleanup,
  );

  /*
   * Give browser time to apply print CSS.
   */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        window.focus();

        window.print();
      } catch (error) {
        console.error(
          "Unable to print costing sheet:",
          error,
        );

        cleanup();
      }
    });
  });
}
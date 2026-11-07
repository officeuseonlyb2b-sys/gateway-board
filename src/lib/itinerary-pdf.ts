import { jsPDF } from "jspdf";
import type { ItineraryRecord } from "./itineraries-store";
import type { BrochureVersion } from "./brochures-store";
import type { SavedQuote } from "./quotes-store";

export type ItineraryPdfMode = "internal" | "customer" | "itinerary";
export interface ItineraryPdfOptions { mode?: ItineraryPdfMode; brochure?: BrochureVersion; quote?: SavedQuote; }

export function itineraryPdfValidation(record: ItineraryRecord): string[] {
  const issues: string[] = [];
  if (!record.title.trim()) issues.push("Package title is required.");
  if (!record.code.trim()) issues.push("Package code is required.");
  if (record.daysCount && record.days.length && record.daysCount !== record.days.length)
    issues.push("Duration days does not match the saved day-wise itinerary.");
  if (record.programmeId && !record.routingFingerprint)
    issues.push("The linked Programme has no routing identity.");
  return issues;
}

const safeName = (value: string) => value.replace(/[<>:"/\\|?*]+/g, "-").trim() || "Itinerary";
const fileToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});

export async function createItineraryPdf(record: ItineraryRecord, banner?: Blob, options: ItineraryPdfOptions = {}): Promise<Blob> {
  const issues = itineraryPdfValidation(record);
  if (issues.length) throw new Error(issues.join(" "));
  const mode = options.mode || "internal";
  const brochure = options.brochure?.id === record.brochureVersionId ? options.brochure : undefined;
  const quote = brochure && options.quote?.id === brochure.source_quote_id ? options.quote : undefined;
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const width = 210; const margin = 16; const usable = width - margin * 2; let y = 18;
  const navy: [number, number, number] = [16, 51, 83]; const gold: [number, number, number] = [179, 137, 58];
  const footer = () => { const page = pdf.getNumberOfPages(); pdf.setDrawColor(...gold); pdf.line(margin, 287, width - margin, 287); pdf.setFontSize(8); pdf.setTextColor(90); pdf.text(`MP Tourism Operations Hub · Page ${page}`, margin, 292); };
  const next = () => { footer(); pdf.addPage(); y = 18; pdf.setTextColor(...navy); pdf.setFontSize(9); pdf.text(record.title || "Itinerary", margin, 10); };
  const clean = (value: string) => value.replace(/[→➜]/g, " -> ").replace(/[•·]/g, "-");
  const paragraph = (text: string, size = 10, gap = 4) => {
    if (!text.trim()) return;
    pdf.setFontSize(size); pdf.setTextColor(48);
    clean(text).split(/\r?\n/).forEach((part, index, parts) => {
      pdf.splitTextToSize(part || " ", usable).forEach((line: string) => { if (y > 278) next(); pdf.text(line, margin, y); y += size * 0.48; });
      if (index < parts.length - 1) y += 1.5;
    });
    y += gap;
  };
  const heading = (text: string) => { if (y > 265) next(); pdf.setFillColor(...navy); pdf.roundedRect(margin, y - 5, usable, 9, 1, 1, "F"); pdf.setTextColor(255); pdf.setFontSize(11); pdf.text(text, margin + 4, y + 1); y += 15; };
  const money = (amount: number | undefined) => amount === undefined || !Number.isFinite(amount) ? "Not available" : `INR ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const table = (columns: string[], rows: string[][], widths?: number[]) => {
    const sizes = widths || columns.map(() => usable / columns.length);
    const drawHeader = () => { if (y > 260) next(); pdf.setFillColor(235, 240, 245); pdf.rect(margin, y - 4, usable, 7, "F"); pdf.setFontSize(7); pdf.setTextColor(...navy); let x = margin + 1; columns.forEach((column, i) => { pdf.text(column, x, y); x += sizes[i]; }); y += 5; };
    drawHeader(); rows.forEach((row) => { const lines = row.map((value, i) => pdf.splitTextToSize(String(value || "-"), sizes[i] - 2)); const height = Math.max(...lines.map((v) => v.length), 1) * 3.4 + 3; if (y + height > 281) { next(); drawHeader(); } let x = margin + 1; pdf.setFontSize(6.8); pdf.setTextColor(45); lines.forEach((cell, i) => { pdf.text(cell, x, y); x += sizes[i]; }); y += height; pdf.setDrawColor(225); pdf.line(margin, y - 1.5, width - margin, y - 1.5); }); y += 3;
  };
  pdf.setFillColor(...navy); pdf.rect(0, 0, width, 54, "F");
  if (banner) { try { const data = await fileToDataUrl(banner); pdf.addImage(data, undefined, 0, 0, width, 54); pdf.setFillColor(10, 30, 50); pdf.setGState(new (pdf as any).GState({ opacity: 0.38 })); pdf.rect(0, 0, width, 54, "F"); pdf.setGState(new (pdf as any).GState({ opacity: 1 })); } catch { /* content-only cover remains valid */ } }
  pdf.setTextColor(255); pdf.setFontSize(11); pdf.text("MP TOURISM OPERATIONS HUB", margin, 16); pdf.setFontSize(23); pdf.text(record.title, margin, 31); pdf.setFontSize(10); pdf.text(`${record.code}  ·  ${record.nights ?? "—"} Nights / ${record.daysCount ?? record.days.length} Days`, margin, 42);
  y = 66; pdf.setTextColor(...navy); pdf.setFontSize(14); pdf.text("Package Overview", margin, y); y += 8;
  paragraph(`${record.startCity || "Start city pending"} → ${record.endCity || "End city pending"}  ·  ${record.route || "Route pending"}`, 10, 5);
  paragraph(record.overview || "DRAFT ITINERARY — Guest-facing overview is pending.", 10, 7);
  if (record.status !== "Published") { pdf.setTextColor(190, 40, 40); pdf.setFontSize(18); pdf.text("DRAFT", width - 52, 66, { angle: 25 }); }
  if (record.highlights.length) { heading("Tour Highlights"); record.highlights.filter(Boolean).forEach((item) => paragraph(`• ${item}`, 10, 1)); }
  if (record.facts.length) { heading("Package Facts"); record.facts.filter(Boolean).forEach((item) => paragraph(`- ${item}`, 10, 1)); }
  if (y > 238) next(); heading("Detailed Itinerary");
  record.days.forEach((day) => { if (y > 245) next(); pdf.setTextColor(...gold); pdf.setFontSize(12); pdf.text(`DAY ${String(day.day).padStart(2, "0")} · ${day.title || "Itinerary Plan"}`, margin, y); y += 7; paragraph(day.route || day.cities.join(" → "), 9, 2); paragraph(day.description, 10, 2); if (day.sightseeing) paragraph(`Sightseeing: ${day.sightseeing}`, 9, 2); if (day.activities) paragraph(`Activities: ${day.activities}`, 9, 2); const guestInfo = [day.meals && `Meals: ${day.meals}`, day.overnightCity && `Overnight: ${day.overnightCity}`, day.hotelNotes].filter(Boolean).join("  ·  "); paragraph(guestInfo, 9, 5); pdf.setDrawColor(220); pdf.line(margin, y, width - margin, y); y += 6; });
  if (brochure && mode !== "itinerary") {
    heading("Brochure Validity & Coverage");
    paragraph(`Snapshot ${brochure.id} / V${brochure.version} / ${brochure.status}. Selling validity: ${brochure.validity_from || "Not recorded"} to ${brochure.validity_till || "Not recorded"}.`, 9, 2);
    const warnings = [...brochure.validation_errors, ...(brochure.coverage_warnings || [])];
    paragraph(warnings.length ? `Coverage warnings: ${warnings.join("; ")}` : "Coverage: no saved warnings.", 9, 4);
    if (mode === "internal" && quote) {
      heading("Hotel & Accommodation Costing");
      table(["Day", "City", "Hotel / category", "Meal", "SGL", "DBL", "TRP"], quote.itinerary.map((day) => [String(day.day_number), day.city, `${day.hotel_name} / ${day.hotel_category}`, day.meal_plan, money(day.rates?.sgl_total), money(day.rates?.dbl_total), money(day.rates?.trp_total)]), [10, 24, 48, 24, 24, 24, 24]);
      heading("Land Services & Transport");
      const serviceRows = [...quote.addons.travels.map((item) => ["Transport", item.name, `${item.days} days`, money(item.total)]), ...quote.addons.guide.map((item) => ["Guide", item.name, `${item.days} days`, money(item.total)]), ...quote.addons.entrances.map((item) => ["Entrance", item.site_name, item.city, money(item.total)]), ...quote.addons.activities.map((item) => ["Activity", item.name, item.destination, money(item.total)])];
      table(["Type", "Service", "Details", "Saved total"], serviceRows.length ? serviceRows : [["-", "Not available in saved snapshot", "-", "-"]], [25, 55, 55, 35]);
      heading("Detailed Commercial Summary");
      table(["Occupancy", "Room base", "Markup", "GST", "Final total"], [["Single", money(quote.totals.room_net_sgl), money(quote.totals.markup_sgl), money(quote.totals.gst_markup_sgl), money(quote.totals.grand_sgl)], ["Double", money(quote.totals.room_net_dbl), money(quote.totals.markup_dbl), money(quote.totals.gst_markup_dbl), money(quote.totals.grand_dbl)], ["Triple", money(quote.totals.room_net_trp), money(quote.totals.markup_trp), money(quote.totals.gst_markup_trp), money(quote.totals.grand_trp)]], [28, 35, 35, 35, 35]);
    }
    heading(mode === "internal" ? "Complete Saved Pricing Matrix" : "Eligible Selling Price Matrix");
    table(["Hotel", "Transport", "Date band", "Pax", "Occupancy", "Final PP"], brochure.scenarios.map((scenario) => [scenario.hotel_category, scenario.transport, `${scenario.validity_from || brochure.validity_from} to ${scenario.validity_till || brochure.validity_till}`, String(scenario.pax), scenario.occupancy.replace(" Sharing", ""), money(scenario.price_per_person)]), [30, 29, 39, 14, 25, 28]);
  }
  const sections: Array<[string, string[]]> = [["Package Inclusions", record.inclusions], ["Package Exclusions", record.exclusions], ["Important Notes", record.notes]];
  sections.forEach(([title, values]) => { if (values.filter(Boolean).length) { heading(title); values.filter(Boolean).forEach((item) => paragraph(`• ${item}`, 10, 1)); } });
  if (record.brochureVersionId) {
    heading("Commercial Pricing Reference");
    paragraph(`Linked immutable Brochure snapshot: V${record.costingVersion ?? "?"}.`, 10, 2);
    paragraph(`Validity: ${record.pricingValidity?.from || "Not recorded"} to ${record.pricingValidity?.till || "Not recorded"}.`, 10, 2);
    paragraph(record.pricingCoverage?.readiness === "Partial" ? "Pricing coverage is partial. Quote only an exact eligible date, pax, hotel, transport and occupancy combination." : "Pricing remains subject to the linked saved snapshot and exact eligible combination.", 9, 3);
  } else paragraph("Content-only draft: no commercial pricing snapshot is linked.", 9, 3);
  footer(); return pdf.output("blob");
}

export function itineraryPdfFilename(record: ItineraryRecord) { return `Itinerary_${safeName(record.code)}_${safeName(record.title)}.pdf`; }

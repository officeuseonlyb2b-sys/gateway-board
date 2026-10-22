import { FileDown, Printer, Save, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { addDaysISO, fmtDateShort, inr } from "@/lib/format";
import type { SavedQuote } from "@/lib/quotes-store";
import type { QuoteDraft } from "@/lib/wizard/types";
import { totalPax } from "@/lib/wizard/calc";

interface Props {
  draft: QuoteDraft;
  quote: SavedQuote;
  isFinalizing: boolean;
  canFinalize: boolean;
  version: number;
  onSaveDraft: () => void;
  onFinalize: () => void | Promise<void>;
  onRequestReview: () => void;
}

function printPreview() {
  document.body.classList.add("quote-viewer-open");
  const cleanup = () => document.body.classList.remove("quote-viewer-open");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1_500);
}

export function CustomerQuotationPreview({
  draft,
  quote,
  isFinalizing,
  canFinalize,
  version,
  onSaveDraft,
  onFinalize,
  onRequestReview,
}: Props) {
  const customer =
    draft.query_type === "B2B"
      ? draft.agent.agency || draft.agent.name
      : draft.query_type === "B2C"
        ? draft.guest.name
        : draft.brochure.theme;
  const selectedAddons = [
    ...quote.addons.travels.map((item) => ({ group: "Transport", name: item.name })),
    ...quote.addons.guide.map((item) => ({ group: "Guide", name: item.name })),
    ...quote.addons.entrances.map((item) => ({ group: "Entrance", name: item.site_name })),
    ...quote.addons.activities.map((item) => ({ group: "Activity", name: item.name })),
    ...quote.addons.miscellaneous.map((item) => ({ group: "Service", name: item.name })),
  ];
  const optionals = quote.addons.optional_supplements ?? [];

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Preview &amp; Save</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer-facing output built from the exact selections already costed in Step 9.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printPreview}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button
            variant="outline"
            onClick={printPreview}
            title="Use Save as PDF in the print dialog"
          >
            <FileDown className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          <Button variant="outline" onClick={onRequestReview}>
            <Send className="mr-2 h-4 w-4" /> Request Review
          </Button>
          <Button variant="outline" onClick={onSaveDraft}>
            <Save className="mr-2 h-4 w-4" /> Save Draft
          </Button>
          <Button disabled={!canFinalize || isFinalizing} onClick={onFinalize}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            {isFinalizing ? "Saving…" : `Save Costing · V${version}`}
          </Button>
        </div>
      </div>

      <div className="quote-print-target mx-auto max-w-5xl bg-white text-slate-900">
        <Card className="overflow-hidden border-slate-200">
          <div className="border-b bg-slate-50 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Quotation Preview
                </div>
                <h3 className="mt-2 text-2xl font-bold">{quote.tour_title}</h3>
                <p className="mt-1 text-sm text-slate-600">Prepared for {customer || "Customer"}</p>
              </div>
              <div className="text-right text-sm">
                <div>
                  <strong>Reference:</strong> {draft.linked_query_id || "Not linked"}
                </div>
                <div>
                  <strong>Duration:</strong> {draft.nights}N / {draft.nights + 1}D
                </div>
                <div>
                  <strong>Travellers:</strong> {totalPax(draft)}
                </div>
                <div>
                  <strong>Travel:</strong> {fmtDateShort(draft.start_date)} –{" "}
                  {fmtDateShort(addDaysISO(draft.start_date, draft.nights))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {quote.cities.map((city) => (
                <Badge key={city} variant="outline">
                  {city}
                </Badge>
              ))}
            </div>
          </div>

          <section className="p-6">
            <h4 className="mb-3 font-semibold">Selected itinerary &amp; accommodation</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Day</th>
                    <th className="p-2">Destination</th>
                    <th className="p-2">Hotel</th>
                    <th className="p-2">Room</th>
                    <th className="p-2">Meal plan</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.itinerary.map((day) => (
                    <tr key={day.day_number} className="border-b">
                      <td className="p-2">{day.day_number}</td>
                      <td className="p-2">{day.city}</td>
                      <td className="p-2 font-medium">{day.hotel_name}</td>
                      <td className="p-2">{day.room_category}</td>
                      <td className="p-2">{day.meal_plan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selectedAddons.length > 0 && (
            <section className="border-t p-6">
              <h4 className="mb-3 font-semibold">Included services</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedAddons.map((item, index) => (
                  <div
                    key={`${item.group}-${item.name}-${index}`}
                    className="rounded-md border p-3 text-sm"
                  >
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      {item.group}
                    </span>
                    <div>{item.name}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {optionals.length > 0 && (
            <section className="border-t p-6">
              <h4 className="mb-3 font-semibold">Optional activities / additional sale</h4>
              <div className="space-y-2">
                {optionals.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex justify-between rounded-md border p-3 text-sm"
                  >
                    <span>{item.name}</span>
                    <strong>{inr(item.total)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="border-t bg-primary/[0.04] p-6">
            <h4 className="mb-3 font-semibold">Package pricing</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(quote.rate_sheet_rows?.length
                ? quote.rate_sheet_rows.map((row) => ({
                    label: `${row.option_label} · ${row.vehicle} · ${row.pax} pax`,
                    value: row.double || row.single || row.triple || row.quad,
                  }))
                : (quote.scenarios?.map((scenario) => ({
                    label: `${scenario.label} · ${scenario.pax} pax`,
                    value: scenario.per_person_avg,
                  })) ?? [])
              ).map((price, index) => (
                <div key={`${price.label}-${index}`} className="rounded-lg border bg-white p-4">
                  <div className="text-xs text-slate-500">{price.label}</div>
                  <div className="mt-1 text-xl font-bold text-primary">
                    {inr(price.value)} <span className="text-xs font-normal">per person</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Card>
      </div>
    </div>
  );
}

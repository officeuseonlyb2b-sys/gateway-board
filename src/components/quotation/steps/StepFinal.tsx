import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { addDaysISO, fmtDateShort, inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { effectivePaxForPricing, computeOptionalTotal } from "@/lib/wizard/calc";
import { validateQuoteForFinalization } from "@/lib/wizard/validation";
import { FinalRateSheet } from "../CostingSheet";
import type { StepProps } from "../shared";

export function Step17({ draft }: StepProps) {
  const db = useDB();
  const review = useMemo(() => validateQuoteForFinalization(draft, db), [draft, db]);
  const pax = Math.max(1, effectivePaxForPricing(draft));
  const endDate = addDaysISO(draft.start_date, draft.nights);
  const customer =
    draft.query_type === "B2B"
      ? draft.agent.agency || draft.agent.name
      : draft.query_type === "B2C"
        ? draft.guest.name
        : draft.brochure.theme;
  const overrideCount = draft.hotel_options.reduce(
    (sum, option) =>
      sum +
      Object.values(option.rate_overrides ?? {}).filter((override) =>
        [override.sgl, override.dbl, override.trp, override.quad].some(
          (value) => typeof value === "number" && value > 0,
        ),
      ).length,
    0,
  );
  const optionalTotal = computeOptionalTotal(draft);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Internal Final Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit the Query, itinerary, component totals and commercial calculations before locking a version.
          </p>
        </div>
        <Badge
          variant="outline"
          className={review.canFinalize ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}
        >
          {review.canFinalize ? "Calculation checks passed" : "Action required"}
        </Badge>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-primary/[0.04] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{draft.query_type || "Type pending"}</Badge>
            <Badge variant="outline">{draft.linked_query_id || "Query not linked"}</Badge>
            {draft.revision_of_quote_id && (
              <Badge variant="secondary">Revision V{draft.intended_version || 2}</Badge>
            )}
          </div>
          <div className="mt-3 text-xl font-bold">{draft.program_name || "Programme pending"}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {customer || "Recipient pending"} · {fmtDateShort(draft.start_date)} – {fmtDateShort(endDate)} · {draft.nights}N/{draft.nights + 1}D · {pax} pax
          </div>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Tour gateways" value={`${draft.tour_start_city || draft.departure_city || "—"} → ${draft.tour_end_city || "—"}`} />
          <Fact label="Costing scenarios" value={String(review.scenarios.length)} />
          <Fact label="Manual hotel-rate days" value={String(overrideCount)} warning={overrideCount > 0} />
          <Fact label="Optional supplements" value={`${draft.optionals.length} · ${inr(optionalTotal)}`} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {review.scenarios.map((scenario) => (
          <Card key={scenario.id} className="overflow-hidden">
            <div className="border-b bg-muted/30 p-4">
              <div className="text-sm font-semibold">{scenario.option_label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{scenario.vehicle_label} · {scenario.pax} pax</div>
            </div>
            <div className="space-y-2 p-4 text-sm">
              <CostLine label="Hotels incl. supplier GST" value={scenario.hotel_total} />
              <CostLine label="Transport" value={scenario.transport_total} />
              <CostLine label="Guide" value={scenario.guide_total} />
              <CostLine label="Entrances" value={scenario.entrances_total} />
              <CostLine label="Activities" value={scenario.activities_total} />
              <CostLine label="Miscellaneous" value={scenario.misc_total} />
              <CostLine label="Meals" value={scenario.meals_total} />
              <CostLine label="Commercial markup" value={scenario.markup_total} strong />
              <CostLine label="Company GST" value={scenario.gst5_total} strong />
              <div className="mt-3 border-t pt-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Average per person</div>
                    <div className="text-lg font-bold text-primary">{inr(scenario.per_person_avg)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Package total</div>
                    <div className="text-lg font-bold">{inr(scenario.grand_total)}</div>
                  </div>
                </div>
              </div>
              {scenario.rate_missing > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> {scenario.rate_missing} accommodation rate(s) missing
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {review.scenarios.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">No valid costing scenario is available yet.</Card>
      )}

      <details className="rounded-xl border bg-background">
        <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold">
          Detailed internal rate sheet
        </summary>
        <div className="border-t p-4">
          <FinalRateSheet draft={draft} />
        </div>
      </details>

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        {review.canFinalize ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
        )}
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LockKeyhole className="h-4 w-4" /> Generated versions are immutable
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Generation creates a permanent snapshot and audit checksum. Corrections must be made through a new revision with a recorded reason.
          </p>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="bg-background p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${warning ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}

function CostLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  if (!value && !strong) return null;
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "font-medium" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{inr(value)}</span>
    </div>
  );
}

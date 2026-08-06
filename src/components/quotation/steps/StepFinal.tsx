// Extracted verbatim from src/routes/_authenticated/costing.tsx (Step 17 UI — Final).
import { useMemo } from "react";
import { AlertCircle, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { inr, addDaysISO, fmtDateShort } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import {
  computeOption, computePersonTotals, totalPax, effectivePaxForPricing,
  optionUsesCustomAllocation, personRoomTypeLabel,
  isGroupTour, autoDoubleMix, mixCoversPax, mixLabel, computeGroupOption,
} from "@/lib/wizard/calc";
import type { QuoteDraft, HotelOption, OptionKey } from "@/lib/wizard/types";
import type { StepProps } from "../shared";

export function Step17({ draft, set }: StepProps) {
  const d = useDB();
  const totals = useMemo(() => draft.hotel_options.map((o) => computeOption(draft, o, d)), [draft, d]);
  const name = draft.query_type === "B2B" ? draft.agent.name : draft.query_type === "B2C" ? draft.guest.name : draft.brochure.theme;
  const endDate = addDaysISO(draft.start_date, draft.nights);

  const recIdx = Math.max(0, draft.hotel_options.findIndex((o) => o.key === draft.recommended_option));
  const focus = totals[recIdx] || totals[0];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Final Cost Summary</h2>
      <Card className="p-4 space-y-2 bg-primary/5">
        <div className="text-xs text-muted-foreground uppercase">Tour</div>
        <div className="text-lg font-bold">{draft.program_name || "—"}</div>
        <div className="text-sm flex gap-4 flex-wrap">
          <span>{fmtDateShort(draft.start_date)} → {fmtDateShort(endDate)}</span>
          <span>{draft.nights}N/{draft.nights + 1}D</span>
          <span>{totalPax(draft)} pax</span>
          <Badge variant="outline">{draft.query_type}</Badge>
          {name && <span className="text-muted-foreground">For: {name}</span>}
        </div>
      </Card>

      {isGroupTour(draft) ? (
        <GroupFinalSummary draft={draft} focusOption={draft.hotel_options[recIdx] || draft.hotel_options[0]} />
      ) : (
        <>
      <Card className="p-4">
        <div className="section-label mb-3">Per Person Cost Based on Group Size {focus && <span className="text-muted-foreground normal-case">— Option {focus.key} · {focus.label || "Select Category"}</span>}</div>
        {focus && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <PersonCard
              icon="👤"
              size="1 Person"
              subtitle="Solo Travel"
              badge="Single Room"
              badgeClass="bg-muted text-foreground"
              perPerson={focus.grand_sgl}
              persons={1}
            />
            <PersonCard
              icon="👥"
              size="2 Persons"
              subtitle="Couple / Pair"
              badge="Shared Room"
              badgeClass="bg-primary/10 text-primary"
              perPerson={focus.grand_dbl / 2}
              persons={2}
              total={focus.grand_dbl}
            />
            <PersonCard
              icon="👥👤"
              size="3 Persons"
              subtitle="Group of 3"
              badge="Room + Extra Bed"
              badgeClass="bg-accent/15 text-accent-foreground"
              perPerson={focus.grand_trp / 3}
              persons={3}
              total={focus.grand_trp}
            />
          </div>
        )}
        <div className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded p-2">
          💡 Rates shown are per person. 2-person rate assumes double room sharing. 3-person rate assumes double room + 1 extra bed.
        </div>
      </Card>

      <Card className="p-4">
        <div className="section-label mb-3">Compare Options (per person)</div>
        <div className="space-y-2">
          {totals.map((t) => {
            const recommended = draft.recommended_option === t.key;
            return (
              <button key={t.key} onClick={() => set({ recommended_option: recommended ? null : (t.key as OptionKey) })}
                className={cn(
                  "w-full grid grid-cols-[1fr_120px_120px_120px_40px] items-center gap-3 p-3 rounded-lg border-2 text-left transition",
                  recommended ? "border-accent bg-accent/10" : "border-border hover:border-primary/40",
                )}>
                <div>
                  <div className="text-sm font-semibold">Option {t.key} · {t.label || "Select Category"}</div>
                  {t.rate_missing > 0 && <div className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {t.rate_missing} rate(s) missing</div>}
                </div>
                <div className="text-right text-xs">1 Person<br /><span className="font-semibold text-sm">{inr(t.grand_sgl)}</span></div>
                <div className="text-right text-xs">2 Persons<br /><span className="font-semibold text-sm">{inr(t.grand_dbl / 2)}</span></div>
                <div className="text-right text-xs">3 Persons<br /><span className="font-semibold text-sm">{inr(t.grand_trp / 3)}</span></div>
                <Star className={cn("h-5 w-5", recommended ? "fill-accent text-accent" : "text-muted-foreground/30")} />
              </button>
            );
          })}
        </div>
      </Card>
        </>
      )}

      <ScenarioFinalBlock draft={draft} />


      {draft.hotel_options.some((o) => optionUsesCustomAllocation(o)) && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-primary hover:bg-muted/30">
            ▼ Room Allocation Detail
          </summary>
          <div className="px-4 pb-4 pt-1">
            <PerPersonSummaryBlock draft={draft} options={draft.hotel_options} title="Per-Person Grand Totals (Custom Allocation)" />
            <div className="mt-2 text-xs text-muted-foreground italic">
              Add-ons split equally. Room cost per actual allocation.
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Shared per-person summary card used in Step 16 & 17.
// Only renders options that use custom room allocation.
// ------------------------------------------------------------
export function PerPersonSummaryBlock({
  draft, options, title,
}: {
  draft: QuoteDraft; options: HotelOption[]; title: string;
}) {
  const d = useDB();
  const active = options.filter((o) => optionUsesCustomAllocation(o));
  if (!active.length) return null;

  return (
    <Card className="p-4 space-y-4">
      <div className="section-label">{title}</div>
      {active.map((opt) => {
        const rows = computePersonTotals(draft, opt, d);
        if (!rows.length) return null;
        const nameById = new Map(rows.map((r) => [r.person_id, r.label]));
        const grand = rows.reduce((s, r) => s + r.grand_total, 0);
        return (
          <div key={opt.key} className="rounded-lg border overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-sm font-semibold text-primary">
              Option {opt.key} · {opt.category || opt.label || "—"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="text-left p-2">Person</th>
                    <th className="text-left p-2">Room</th>
                    <th className="text-right p-2">Rooms Total</th>
                    <th className="text-right p-2">Add-Ons Share</th>
                    <th className="text-right p-2">Markup</th>
                    <th className="text-right p-2">GST 5%</th>
                    <th className="text-right p-2">Grand Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.person_id} className="border-t">
                      <td className="p-2">{r.label}</td>
                      <td className="p-2 text-muted-foreground text-xs">
                        {personRoomTypeLabel(r.room_type, r.sharing_with)}
                        {r.sharing_with.length > 0 && (
                          <> · w/ {r.sharing_with.map((id) => nameById.get(id) || `#${id}`).join(", ")}</>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{inr(r.room_total)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(r.shared_addons)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(r.markup)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(r.gst5)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold text-primary">{inr(r.grand_total)}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-primary/5 font-semibold">
                    <td className="p-2" colSpan={6}>Option {opt.key} · Group Total</td>
                    <td className="p-2 text-right tabular-nums text-primary">{inr(grand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div className="text-xs text-muted-foreground italic">
        Add-ons are split equally across all travellers. GST slab (5% / 18%) is applied on the effective room tariff, then 5% GST is applied on the markup layer.
      </div>
    </Card>
  );
}

function GroupFinalSummary({ draft, focusOption }: { draft: QuoteDraft; focusOption: HotelOption | undefined }) {
  const d = useDB();
  const pax = Math.max(1, effectivePaxForPricing(draft));
  const mix = draft.group_room_mix || autoDoubleMix(pax);
  if (!focusOption) return null;
  const tot = computeGroupOption(draft, focusOption, d, mix);
  return (
    <Card className="p-6 bg-primary/5">
      <div className="text-xs uppercase text-muted-foreground mb-2">Group Package — {focusOption.label || "Option " + focusOption.key}</div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Total Pax</div>
          <div className="text-2xl font-bold">{pax}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Room Configuration</div>
          <div className="text-sm font-semibold">{mixLabel(mix)}</div>
          <div className="text-xs text-muted-foreground">{mixCoversPax(mix)} pax covered</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Per Person</div>
          <div className="text-2xl font-bold text-primary">{inr(tot.per_person)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Grand Total</div>
          <div className="text-2xl font-bold text-accent-foreground">{inr(tot.grand_total)}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm border-t pt-3">
        <div><div className="text-xs text-muted-foreground">Rooms Net</div><div className="font-medium">{inr(tot.room_net)}</div></div>
        <div><div className="text-xs text-muted-foreground">GST on Rooms</div><div className="font-medium">{inr(tot.room_gst)}</div></div>
        <div><div className="text-xs text-muted-foreground">Add-Ons</div><div className="font-medium">{inr(tot.addons_total)}</div></div>
        <div><div className="text-xs text-muted-foreground">Markup {draft.markup_percent}%</div><div className="font-medium">{inr(tot.markup)}</div></div>
        <div><div className="text-xs text-muted-foreground">GST 5%</div><div className="font-medium">{inr(tot.gst5)}</div></div>
      </div>
    </Card>
  );
}




function PersonCard({ icon, size, subtitle, badge, badgeClass, perPerson, persons, total }: {
  icon: string; size: string; subtitle: string; badge: string; badgeClass: string;
  perPerson: number; persons: number; total?: number;
}) {
  return (
    <div className="border-2 border-primary/20 rounded-lg p-4 bg-card flex flex-col items-center text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-sm font-semibold">{size}</div>
      <div className="text-xs text-muted-foreground mb-2">{subtitle}</div>
      <span className={cn("text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full mb-3", badgeClass)}>{badge}</span>
      <div className="text-[28px] font-bold text-primary tabular-nums leading-tight">{inr(perPerson)}</div>
      <div className="text-xs text-muted-foreground">per person</div>
      {total !== undefined && (
        <div className="text-[11px] text-muted-foreground italic mt-2">
          Total: {inr(total)} <span className="opacity-70">({persons} × {inr(perPerson)})</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STEP 18 — Optionals + Actions

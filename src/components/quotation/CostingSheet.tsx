// Costing sheet — Land Part and Hotels & Meals side by side, with a
// Rate Sheet (Per Pax / Person) beneath. One variation per selected
// Hotel Category, each paired with the available vehicle options.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr, fmtDateShort } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import {
  buildLandPart, buildHotelMealSheet, buildRateSheet,
  type LandPartSheet, type HotelMealSheet, type RateSheetGroup,
} from "@/lib/wizard/costsheet";
import type { QuoteDraft, HotelOption } from "@/lib/wizard/types";

export function CostingSheet({ draft }: { draft: QuoteDraft }) {
  const d = useDB();
  const options = draft.hotel_options ?? [];
  const [tab, setTab] = useState<string>(options[0]?.key ?? "A");

  if (options.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Add at least one Accommodation Option to see the costing sheet.
      </Card>
    );
  }

  return (
    <Tabs value={options.some((o) => o.key === tab) ? tab : options[0].key} onValueChange={setTab}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="section-label">Costing — {options.length} variation{options.length > 1 ? "s" : ""}</div>
        <TabsList>
          {options.map((o) => (
            <TabsTrigger key={o.key} value={o.key} className="text-xs">
              {o.category || o.label || `Option ${o.key}`}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {options.map((o) => (
        <TabsContent key={o.key} value={o.key} className="space-y-4 mt-3">
          <Variation draft={draft} d={d} opt={o} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function Variation({ draft, d, opt }: { draft: QuoteDraft; d: ReturnType<typeof useDB>; opt: HotelOption }) {
  const land = useMemo<LandPartSheet>(() => buildLandPart(draft, d), [draft, d]);
  const hotels = useMemo<HotelMealSheet>(() => buildHotelMealSheet(draft, d, opt), [draft, d, opt]);
  const sheets = useMemo<RateSheetGroup[]>(
    () => buildRateSheet(draft, d, opt, draft.transport ?? []),
    [draft, d, opt],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 items-start">
        <LandPartBlock land={land} />
        <HotelMealBlock sheet={hotels} />
      </div>
      <RateSheetBlock groups={sheets} />
    </div>
  );
}

const th = "p-1.5 text-right font-medium whitespace-nowrap";
const thL = "p-1.5 text-left font-medium whitespace-nowrap";
const td = "p-1.5 text-right tabular-nums whitespace-nowrap";

function LandPartBlock({ land }: { land: LandPartSheet }) {
  return (
    <Card className="p-3 space-y-2">
      <div className="section-label">Land Part</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className={thL}>Day</th>
              <th className={thL}>Date</th>
              <th className={thL}>Route</th>
              <th className={thL}>City / Tour</th>
              <th className={th}>Vehicle</th>
              <th className={th}>Guide</th>
              <th className={th}>Entrances</th>
              <th className={th}>Activities</th>
              <th className={th}>Misc</th>
            </tr>
          </thead>
          <tbody>
            {land.rows.map((r) => (
              <tr key={r.day} className="border-t">
                <td className="p-1.5">{r.day}</td>
                <td className="p-1.5 whitespace-nowrap">{r.date ? fmtDateShort(r.date) : "—"}</td>
                <td className="p-1.5">{r.route}</td>
                <td className="p-1.5">
                  <div>{r.city}</div>
                  <div className="text-[10px] text-muted-foreground">{r.tours}</div>
                </td>
                <td className={td}>{r.transport ? inr(r.transport) : "—"}</td>
                <td className={td}>{r.guide ? inr(r.guide) : "—"}</td>
                <td className={td}>{r.entrances ? inr(r.entrances) : "—"}</td>
                <td className={td}>{r.activities ? inr(r.activities) : "—"}</td>
                <td className={td}>{r.misc ? inr(r.misc) : "—"}</td>
              </tr>
            ))}
            {land.rows.length === 0 && (
              <tr><td colSpan={9} className="p-3 text-center text-muted-foreground">No routing days yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-primary/5 font-semibold">
              <td className="p-1.5" colSpan={4}>Line Total</td>
              <td className={td}>{inr(land.transport_total)}</td>
              <td className={td}>{inr(land.guide_total)}</td>
              <td className={td}>{inr(land.entrances_total)}</td>
              <td className={td}>{inr(land.activities_total)}</td>
              <td className={td}>{inr(land.misc_total)}</td>
            </tr>
            <tr className="bg-primary/10 font-bold">
              <td className="p-1.5" colSpan={8}>Land Part Total</td>
              <td className={td}>{inr(land.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function HotelMealBlock({ sheet }: { sheet: HotelMealSheet }) {
  const n = Math.max(1, sheet.nights);
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="section-label">Hotels &amp; Meals</div>
        <Badge variant="secondary" className="text-[10px]">{sheet.category} · {sheet.nights} night(s)</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className={thL}>Night</th>
              <th className={thL}>Hotel / Room</th>
              <th className={thL}>Plan</th>
              <th className={th}>SGL</th>
              <th className={th}>DBL</th>
              <th className={th}>TRP</th>
              <th className={th}>QUAD</th>
              <th className={thL}>Lunch</th>
              <th className={th}>Amt</th>
              <th className={thL}>Dinner</th>
              <th className={th}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.day} className="border-t">
                <td className="p-1.5 whitespace-nowrap">
                  <div>Day {r.day}</div>
                  <div className="text-[10px] text-muted-foreground">{r.city}</div>
                </td>
                <td className="p-1.5">
                  <div>{r.hotel}</div>
                  <div className="text-[10px] text-muted-foreground">{r.room}</div>
                </td>
                <td className="p-1.5">{r.meal_plan}</td>
                <td className={td}>{r.sgl ? inr(r.sgl) : "—"}</td>
                <td className={td}>{r.dbl ? inr(r.dbl) : "—"}</td>
                <td className={td}>{r.trp ? inr(r.trp) : "—"}</td>
                <td className={td}>{r.quad ? inr(r.quad) : "—"}</td>
                <td className="p-1.5">{r.lunch_source}</td>
                <td className={td}>{r.lunch_total ? inr(r.lunch_total) : "—"}</td>
                <td className="p-1.5">{r.dinner_source}</td>
                <td className={td}>{r.dinner_total ? inr(r.dinner_total) : "—"}</td>
              </tr>
            ))}
            {sheet.rows.length === 0 && (
              <tr><td colSpan={11} className="p-3 text-center text-muted-foreground">No overnight stays selected.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-medium">
              <td className="p-1.5" colSpan={3}>Subtotal (Per Night)</td>
              <td className={td}>{inr(sheet.sgl / n)}</td>
              <td className={td}>{inr(sheet.dbl / n)}</td>
              <td className={td}>{inr(sheet.trp / n)}</td>
              <td className={td}>{inr(sheet.quad / n)}</td>
              <td className="p-1.5" />
              <td className={td}>{inr(sheet.lunch_total / n)}</td>
              <td className="p-1.5" />
              <td className={td}>{inr(sheet.dinner_total / n)}</td>
            </tr>
            <tr className="bg-primary/10 font-bold">
              <td className="p-1.5" colSpan={3}>Total ({sheet.nights} Nights)</td>
              <td className={td}>{inr(sheet.sgl)}</td>
              <td className={td}>{inr(sheet.dbl)}</td>
              <td className={td}>{inr(sheet.trp)}</td>
              <td className={td}>{inr(sheet.quad)}</td>
              <td className="p-1.5" />
              <td className={td}>{inr(sheet.lunch_total)}</td>
              <td className="p-1.5" />
              <td className={td}>{inr(sheet.dinner_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function RateSheetBlock({ groups }: { groups: RateSheetGroup[] }) {
  return (
    <Card className="p-3 space-y-2">
      <div className="section-label">Rate Sheet (Per Pax / Person)</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="bg-muted/60">
              <th className={thL} colSpan={8}>Land Part</th>
              <th className={th} colSpan={6}>Accommodation Part</th>
              <th className={th} colSpan={5}>Package Cost (Per Person)</th>
            </tr>
            <tr className="bg-muted/40">
              <th className={thL}>Pax</th>
              <th className={thL}>Vehicle</th>
              <th className={th}>Transport</th>
              <th className={th}>Guide</th>
              <th className={th}>Escort</th>
              <th className={th}>Entrances</th>
              <th className={th}>Activities</th>
              <th className={th}>Misc</th>
              <th className={th}>Single</th>
              <th className={th}>Double</th>
              <th className={th}>Triple</th>
              <th className={th}>Quad</th>
              <th className={th}>Lunch</th>
              <th className={th}>Dinner</th>
              <th className={th}>Pax</th>
              <th className={th}>Single Occ.</th>
              <th className={th}>Double Sharing</th>
              <th className={th}>Triple Sharing</th>
              <th className={th}>Quad Sharing</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <>
                <tr key={`${g.vehicle}-h`} className="border-t bg-primary/5">
                  <td className="p-1.5 font-semibold" colSpan={19}>{g.vehicle}</td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={`${g.vehicle}-${r.pax}`} className="border-t">
                    <td className="p-1.5">{r.pax}</td>
                    <td className="p-1.5">{r.vehicle}</td>
                    <td className={td}>{inr(r.transport)}</td>
                    <td className={td}>{inr(r.guide)}</td>
                    <td className={td}>{inr(r.escort)}</td>
                    <td className={td}>{inr(r.entrances)}</td>
                    <td className={td}>{inr(r.activities)}</td>
                    <td className={td}>{inr(r.misc)}</td>
                    <td className={td}>{inr(r.single)}</td>
                    <td className={td}>{inr(r.double)}</td>
                    <td className={td}>{inr(r.triple)}</td>
                    <td className={td}>{inr(r.quad)}</td>
                    <td className={td}>{inr(r.lunch)}</td>
                    <td className={td}>{inr(r.dinner)}</td>
                    <td className={td}>{r.pax}</td>
                    <td className={`${td} font-semibold`}>{inr(r.pkg_single)}</td>
                    <td className={`${td} font-semibold`}>{inr(r.pkg_double)}</td>
                    <td className={`${td} font-semibold`}>{inr(r.pkg_triple)}</td>
                    <td className={`${td} font-semibold`}>{inr(r.pkg_quad)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

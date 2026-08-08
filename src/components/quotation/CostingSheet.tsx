// Costing sheet — Land Part and Hotels & Meals side by side, with a
// Rate Sheet (Per Pax / Person) beneath. One variation per selected
// Hotel Category, each paired with the available vehicle options.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr, fmtDateShort } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import {
  landMarkup, landGst, hotelsMarkup, hotelsGst, effectivePaxForPricing,
} from "@/lib/wizard/calc";
import {
  buildLandPart, buildHotelMealSheet, buildRateSheet,
  type LandPartSheet, type HotelMealSheet, type RateSheetGroup,
  type SheetOption, type LandDayRow,
} from "@/lib/wizard/costsheet";
import type { QuoteDraft, HotelOption, EntranceCat, CostingSelection } from "@/lib/wizard/types";

type Bucket = "transport" | "guide" | "entrances" | "activities" | "misc";
type SetDraft = (p: Partial<QuoteDraft>) => void;

export function CostingSheet({ draft, set }: { draft: QuoteDraft; set?: SetDraft }) {
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

  // Toggle one component id for one day.
  const toggle = (bucket: Bucket, day: number, id: string, allIds: string[]) => {
    if (!set) return;
    const sel: CostingSelection = { ...(draft.costing_selection ?? {}) };
    const map = { ...((sel[bucket] as Record<number, string[]>) ?? {}) };
    const current = map[day] ?? allIds;
    map[day] = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    (sel as Record<string, unknown>)[bucket] = map;
    set({ costing_selection: sel });
  };

  const toggleCat = (day: number, cat: EntranceCat) => {
    if (!set) return;
    const sel: CostingSelection = { ...(draft.costing_selection ?? {}) };
    const map = { ...(sel.entrance_cats ?? {}) };
    const current = map[day] ?? (["indian", "foreign", "student"] as EntranceCat[]);
    map[day] = current.includes(cat) ? current.filter((x) => x !== cat) : [...current, cat];
    sel.entrance_cats = map;
    set({ costing_selection: sel });
  };

  return (
    <Tabs value={options.some((o) => o.key === tab) ? tab : options[0].key} onValueChange={setTab}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="section-label">Costing — {options.length} variation{options.length > 1 ? "s" : ""}</div>
        <TabsList className="flex-wrap h-auto">
          {options.map((o) => (
            <TabsTrigger key={o.key} value={o.key} className="text-xs">
              {o.category || o.label || `Option ${o.key}`}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {options.map((o) => (
        <TabsContent key={o.key} value={o.key} className="space-y-4 mt-3">
          <Variation draft={draft} d={d} opt={o} toggle={toggle} toggleCat={toggleCat} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

interface Handlers {
  toggle: (bucket: Bucket, day: number, id: string, allIds: string[]) => void;
  toggleCat: (day: number, cat: EntranceCat) => void;
}

function Variation({
  draft, d, opt, toggle, toggleCat,
}: { draft: QuoteDraft; d: ReturnType<typeof useDB>; opt: HotelOption } & Handlers) {
  const land = useMemo<LandPartSheet>(() => buildLandPart(draft, d), [draft, d]);
  const hotels = useMemo<HotelMealSheet>(() => buildHotelMealSheet(draft, d, opt), [draft, d, opt]);
  const sheets = useMemo<RateSheetGroup[]>(
    () => buildRateSheet(draft, d, opt, draft.transport ?? []),
    [draft, d, opt],
  );
  const pax = Math.max(1, effectivePaxForPricing(draft));
  const landPct = { mk: landMarkup(draft) * 100, gst: landGst(draft) * 100 };
  const hotelPct = { mk: hotelsMarkup(draft) * 100, gst: hotelsGst(draft) * 100 };

  return (
    <div className="space-y-4">
      {/* Land Part and Hotels & Meals side by side, scrolling horizontally when tight */}
      <div className="overflow-x-auto">
        <div className="flex gap-4 items-start min-w-max">
          <LandPartBlock
            land={land} pax={pax} pct={landPct} toggle={toggle} toggleCat={toggleCat}
          />
          <HotelMealBlock sheet={hotels} pax={pax} pct={hotelPct} />
        </div>
      </div>
      <RateSheetBlock groups={sheets} landPct={landPct} hotelPct={hotelPct} />
    </div>
  );
}

const th = "p-1.5 text-right font-medium whitespace-nowrap";
const thL = "p-1.5 text-left font-medium whitespace-nowrap";
const td = "p-1.5 text-right tabular-nums whitespace-nowrap";

/** base → markup → GST → per person, shown inline under each section. */
function applied(base: number, mk: number, gst: number, pax: number) {
  const markup = base * (mk / 100);
  const withMk = base + markup;
  const gstAmt = withMk * (gst / 100);
  const total = withMk + gstAmt;
  return { markup, gstAmt, total, per_person: total / pax };
}

function MarkupRows({
  label, values, mk, gst, pax, leadSpan,
}: {
  label: string;
  values: number[];
  mk: number; gst: number; pax: number; leadSpan: number;
}) {
  const rows: [string, (v: number) => number][] = [
    [`Markup ${mk}%`, (v) => applied(v, mk, gst, pax).markup],
    [`GST ${gst}%`, (v) => applied(v, mk, gst, pax).gstAmt],
    [`Per person (${pax} pax)`, (v) => applied(v, mk, gst, pax).per_person],
  ];
  return (
    <>
      {rows.map(([name, fn], i) => (
        <tr key={name} className={i === 2 ? "bg-primary/10 font-semibold" : "text-muted-foreground"}>
          <td className="p-1.5 text-[10px] uppercase" colSpan={leadSpan}>
            {i === 0 ? `${label} · ` : ""}{name}
          </td>
          {values.map((v, j) => <td key={j} className={td}>{inr(fn(v))}</td>)}
        </tr>
      ))}
    </>
  );
}

function OptionCell({
  opts, bucket, day, onToggle,
}: {
  opts: SheetOption[]; bucket: Bucket; day: number;
  onToggle: Handlers["toggle"];
}) {
  if (opts.length === 0) return <td className="p-1.5 text-right text-muted-foreground">—</td>;
  const allIds = opts.map((o) => o.id);
  return (
    <td className="p-1.5 align-top">
      <div className="space-y-1">
        {opts.map((o) => (
          <label key={o.id} className="flex items-start gap-1.5 cursor-pointer">
            <Checkbox
              checked={o.checked}
              onCheckedChange={() => onToggle(bucket, day, o.id, allIds)}
              className="mt-0.5"
            />
            <span className="flex-1 min-w-0">
              <span className="block truncate max-w-[150px]">{o.label}</span>
              {o.sub && <span className="block text-[10px] text-muted-foreground truncate max-w-[150px]">{o.sub}</span>}
            </span>
            <span className={`tabular-nums ${o.checked ? "" : "line-through text-muted-foreground"}`}>
              {inr(o.amount)}
            </span>
          </label>
        ))}
      </div>
    </td>
  );
}

function LandPartBlock({
  land, pax, pct, toggle, toggleCat,
}: { land: LandPartSheet; pax: number; pct: { mk: number; gst: number } } & Handlers) {
  const cats: [EntranceCat, string][] = [["indian", "Indian"], ["foreign", "Foreigner"], ["student", "Student"]];
  return (
    <Card className="p-3 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="section-label">Land Part</div>
        <Badge variant="secondary" className="text-[10px]">
          Markup {pct.mk}% · GST {pct.gst}% applied per person
        </Badge>
      </div>
      <table className="text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className={thL}>Day</th>
            <th className={thL}>Date</th>
            <th className={thL}>Route</th>
            <th className={thL}>City / Tour</th>
            <th className={thL}>Vehicle Options</th>
            <th className={thL}>Guide Options</th>
            <th className={thL}>
              Monument Entrances
            </th>
            <th className={thL}>Activity &amp; Experiences</th>
            <th className={thL}>Miscellaneous</th>
          </tr>
        </thead>
        <tbody>
          {land.rows.map((r: LandDayRow) => (
            <tr key={r.day} className="border-t align-top">
              <td className="p-1.5">{r.day}</td>
              <td className="p-1.5 whitespace-nowrap">{r.date ? fmtDateShort(r.date) : "—"}</td>
              <td className="p-1.5">{r.route}</td>
              <td className="p-1.5">
                <div>{r.city}</div>
                <div className="text-[10px] text-muted-foreground">{r.tours}</div>
              </td>
              <OptionCell opts={r.transport_opts} bucket="transport" day={r.day} onToggle={toggle} />
              <OptionCell opts={r.guide_opts} bucket="guide" day={r.day} onToggle={toggle} />
              <td className="p-1.5 align-top">
                <div className="flex gap-2 pb-1">
                  {cats.map(([c, label]) => (
                    <label key={c} className="flex items-center gap-1 text-[10px] cursor-pointer">
                      <Checkbox checked={r.entrance_cats[c]} onCheckedChange={() => toggleCat(r.day, c)} />
                      {label}
                    </label>
                  ))}
                </div>
                {r.entrance_opts.length === 0 ? (
                  <div className="text-right text-muted-foreground">—</div>
                ) : (
                  <div className="space-y-1">
                    {r.entrance_opts.map((o) => (
                      <label key={o.id} className="flex items-start gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={o.checked}
                          onCheckedChange={() => toggle("entrances", r.day, o.id, r.entrance_opts.map((x) => x.id))}
                          className="mt-0.5"
                        />
                        <span className="flex-1 truncate max-w-[150px]">{o.label}</span>
                        <span className={`tabular-nums ${o.checked ? "" : "line-through text-muted-foreground"}`}>{inr(o.amount)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </td>
              <OptionCell opts={r.activity_opts} bucket="activities" day={r.day} onToggle={toggle} />
              <OptionCell opts={r.misc_opts} bucket="misc" day={r.day} onToggle={toggle} />
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
          <MarkupRows
            label="Land Part"
            leadSpan={4}
            mk={pct.mk} gst={pct.gst} pax={pax}
            values={[land.transport_total, land.guide_total, land.entrances_total, land.activities_total, land.misc_total]}
          />
          <tr className="bg-primary/10 font-bold">
            <td className="p-1.5" colSpan={8}>Land Part Total</td>
            <td className={td}>{inr(land.grand_total)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

function HotelMealBlock({
  sheet, pax, pct,
}: { sheet: HotelMealSheet; pax: number; pct: { mk: number; gst: number } }) {
  const n = Math.max(1, sheet.nights);
  return (
    <Card className="p-3 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="section-label">Hotels &amp; Meals</div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{sheet.category} · {sheet.nights} night(s)</Badge>
          <Badge variant="secondary" className="text-[10px]">Markup {pct.mk}% · GST {pct.gst}% applied</Badge>
        </div>
      </div>
      <table className="text-xs">
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
          <HotelMarkupRows sheet={sheet} pct={pct} pax={pax} />
        </tfoot>
      </table>
    </Card>
  );
}

function HotelMarkupRows({
  sheet, pct, pax,
}: { sheet: HotelMealSheet; pct: { mk: number; gst: number }; pax: number }) {
  const cells = [sheet.sgl, sheet.dbl, sheet.trp, sheet.quad];
  const rows: [string, (v: number) => number][] = [
    [`Markup ${pct.mk}%`, (v) => applied(v, pct.mk, pct.gst, pax).markup],
    [`GST ${pct.gst}%`, (v) => applied(v, pct.mk, pct.gst, pax).gstAmt],
    ["Per person (share)", (v) => 0 + applied(v, pct.mk, pct.gst, 1).total],
  ];
  const shares = [1, 2, 3, 4];
  return (
    <>
      {rows.map(([name, fn], i) => (
        <tr key={name} className={i === 2 ? "bg-primary/10 font-semibold" : "text-muted-foreground"}>
          <td className="p-1.5 text-[10px] uppercase" colSpan={3}>
            {i === 0 ? "Hotels & Meals · " : ""}{name}
          </td>
          {cells.map((v, j) => (
            <td key={j} className={td}>{inr(i === 2 ? fn(v) / shares[j] : fn(v))}</td>
          ))}
          <td className="p-1.5" />
          <td className={td}>{inr(i === 2 ? applied(sheet.lunch_total, pct.mk, pct.gst, 1).total : fn(sheet.lunch_total))}</td>
          <td className="p-1.5" />
          <td className={td}>{inr(i === 2 ? applied(sheet.dinner_total, pct.mk, pct.gst, 1).total : fn(sheet.dinner_total))}</td>
        </tr>
      ))}
    </>
  );
}

function RateSheetBlock({
  groups, landPct, hotelPct,
}: {
  groups: RateSheetGroup[];
  landPct: { mk: number; gst: number };
  hotelPct: { mk: number; gst: number };
}) {
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="section-label">Rate Sheet (Per Pax / Person)</div>
          <div className="text-xs text-muted-foreground">Land Part + Accommodation Part</div>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-[10px]">Land: Markup {landPct.mk}% · GST {landPct.gst}%</Badge>
          <Badge variant="secondary" className="text-[10px]">Hotels &amp; Meals: Markup {hotelPct.mk}% · GST {hotelPct.gst}%</Badge>
        </div>
      </div>
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
              <FragmentGroup key={g.line_id ?? g.vehicle} group={g} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FragmentGroup({ group: g }: { group: RateSheetGroup }) {
  return (
    <>
      <tr className="border-t bg-primary/5">
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
  );
}

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
  landMarkup, landGst, hotelsMarkup, hotelsGst, effectivePaxForPricing, gstRateFor,
} from "@/lib/wizard/calc";
import {
  buildLandPart, buildHotelMealSheet, buildRateSheet, mixTotals,
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

  // Toggle component globally (day = -1) or locally per day.
  // `checkedByDay` carries the currently-checked ids so defaults stay intact.
  const toggle = (
    bucket: Bucket, day: number, id: string,
    checkedByDay: Record<number, string[]>, allDays?: number[],
  ) => {
    if (!set) return;
    const sel: CostingSelection = { ...(draft.costing_selection ?? {}) };
    const map = { ...((sel[bucket] as Record<number, string[]>) ?? {}) };

    const daysToUpdate = day === -1
      ? (allDays ?? draft.routing?.map((rd) => rd.day) ?? [])
      : [day];
    if (daysToUpdate.length === 0) return;

    daysToUpdate.forEach((dayNum) => {
      const current = map[dayNum] ?? checkedByDay[dayNum] ?? [];
      // Guide language ids are "<lineId>::<Language>" — one language per line.
      if (bucket === "guide" && id.includes("::")) {
        const prefix = `${id.split("::")[0]}::`;
        const others = current.filter((x) => !x.startsWith(prefix));
        map[dayNum] = current.includes(id) ? others : [...others, id];
      } else {
        map[dayNum] = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      }
    });

    (sel as Record<string, unknown>)[bucket] = map;
    set({ costing_selection: sel });
  };


  // Toggle Monument Categories globally
  const toggleCat = (day: number, cat: EntranceCat, allDays?: number[]) => {
    if (!set) return;
    const sel: CostingSelection = { ...(draft.costing_selection ?? {}) };
    const map = { ...(sel.entrance_cats ?? {}) };

    let daysToUpdate: number[];
    if (day === -1) {
      daysToUpdate = allDays ?? (draft.routing?.map((rd) => rd.day) ?? Object.keys(map).map(Number));
      if (daysToUpdate.length === 0) return;
    } else {
      daysToUpdate = [day];
    }

    daysToUpdate.forEach(dayNum => {
      const current = map[dayNum] ?? ([] as EntranceCat[]);
      map[dayNum] = current.includes(cat) ? [] : [cat];
    });

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
  toggle: (
    bucket: Bucket, day: number, id: string,
    checkedByDay: Record<number, string[]>, allDays?: number[],
  ) => void;
  toggleCat: (day: number, cat: EntranceCat, allDays?: number[]) => void;
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

/** UPDATED: base → markup → GST applied on (Base + Markup) → per person */
function applyMarkupAndGst(base: number, mk: number, gst: number, pax: number) {
  const markup = base * (mk / 100);
  const basePlusMarkup = base + markup;
  const gstAmt = basePlusMarkup * (gst / 100);
  const total = basePlusMarkup + gstAmt;
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
    [`Markup ${mk}%`, (v) => applyMarkupAndGst(v, mk, gst, pax).markup],
    [`GST ${gst}% (on Base+Markup)`, (v) => applyMarkupAndGst(v, mk, gst, pax).gstAmt],
    [`Per person (${pax} pax)`, (v) => applyMarkupAndGst(v, mk, gst, pax).per_person],
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
  const checkedByDay = { [day]: opts.filter((o) => o.checked).map((o) => o.id) };
  return (
    <td className="p-1.5 align-top">
      <div className="space-y-1">
        {opts.map((o) => (
          <label key={o.id} className="flex items-start gap-1.5 cursor-pointer">
            <Checkbox
              checked={o.checked}
              onCheckedChange={() => onToggle(bucket, day, o.id, checkedByDay)}
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
  const firstRow = land.rows[0];
  const allDayNumbers = land.rows.map(r => r.day);
  /** Currently-checked option ids per day, so global toggles keep other days intact. */
  const checkedByDay = (bucket: Bucket): Record<number, string[]> => {
    const key = {
      transport: "transport_opts", guide: "guide_opts", entrances: "entrance_opts",
      activities: "activity_opts", misc: "misc_opts",
    }[bucket] as keyof LandDayRow;
    const out: Record<number, string[]> = {};
    land.rows.forEach((r) => {
      out[r.day] = (r[key] as SheetOption[]).filter((o) => o.checked).map((o) => o.id);
    });
    return out;
  };


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
            
            {/* 🚗 Global Vehicle Options Header — laid out horizontally */}
            <th className={thL} style={{ minWidth: '220px', verticalAlign: 'top' }}>
              <div className="mb-1">Vehicle Options</div>
              <div className="flex flex-wrap gap-2 font-normal">
                {firstRow?.transport_opts.map((o) => (
                  <label key={o.id} className="flex items-center gap-1 text-[9px] cursor-pointer">
                    <Checkbox
                      checked={o.checked}
                      onCheckedChange={() => toggle('transport', -1, o.id, checkedByDay('transport'), allDayNumbers)}
                    />
                    <span className="truncate max-w-[110px] normal-case">{o.label}</span>
                  </label>
                ))}
              </div>
            </th>


            {/* 🗣️ Guide Options — Hindi / English / Language, per day */}
            <th className={thL} style={{ minWidth: '180px', verticalAlign: 'top' }}>
              <div className="mb-1">Guide Options</div>
              <div className="text-[9px] normal-case font-normal text-muted-foreground">
                Hindi · English · Language
              </div>
            </th>


            {/* 🏛️ Global Monument Categories Header */}
            <th className={thL} style={{ minWidth: '150px', verticalAlign: 'top' }}>
              <div className="mb-1">Monument Entrances</div>
              <div className="flex gap-1 font-normal">
                {cats.map(([c, label]) => (
                  <label key={c} className="flex items-center gap-1 text-[9px] cursor-pointer">
                    <Checkbox
                      checked={firstRow?.entrance_cats[c] ?? false}
                      onCheckedChange={() => toggleCat(-1, c, allDayNumbers)}
                      className="mt-0.5"
                    />
                    {label}
                  </label>
                ))}
              </div>
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

              {/* Vehicle Price (Globally Selected) — each vehicle shown separately */}
              <td className="p-1.5 align-top">
                {(() => {
                  const selected = r.transport_opts.filter((o) => o.checked);
                  if (selected.length === 0) return <div className="text-right text-muted-foreground">—</div>;
                  return (
                    <div className="space-y-1">
                      {selected.map((o) => (
                        <div key={o.id} className="flex items-start gap-1.5">
                          <span className="flex-1 truncate max-w-[120px]">{o.label}</span>
                          <span className="tabular-nums">{inr(o.amount)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </td>


              {/* Guide — Hindi / English / Language checkboxes for this day */}
              <OptionCell opts={r.guide_opts} bucket="guide" day={r.day} onToggle={toggle} />

              {/* Monuments - Per Day Checkboxes */}
              <td className="p-1.5 align-top">
                {r.entrance_opts.length === 0 ? (
                  <div className="text-right text-muted-foreground">—</div>
                ) : (
                  <div className="space-y-1">
                    {r.entrance_opts.map((o) => (
                      <label key={o.id} className="flex items-start gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={o.checked}
                          onCheckedChange={() => toggle("entrances", r.day, o.id, checkedByDay("entrances"))}
                          className="mt-0.5"
                        />

                        <span className="flex-1 truncate max-w-[150px]">{o.label}</span>
                        <span className={`tabular-nums ${o.checked ? "" : "line-through text-muted-foreground"}`}>
                          {inr(o.amount)}
                        </span>
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
            mk={pct.mk}
            gst={pct.gst}
            pax={pax}
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

  // Step 1: Calculate Net, GST, and Total (Inclusive) per row exactly like StepHotels.tsx
  // Dynamic-mode nights skip the flat SGL/DBL/TRP/QUAD columns and are priced
  // from the room mix allocated for that night instead.
  const computedRows = sheet.rows.map(r => {
    const dyn = r.dynamic ? mixTotals(r) : null;
    const z = (v: number) => (dyn ? 0 : v);

    const sglNet = z(r.sgl || 0);
    const sglGst = sglNet * gstRateFor(sglNet);
    const sglTotal = sglNet + sglGst;

    const dblNet = z(r.dbl || 0);
    const dblGst = dblNet * gstRateFor(dblNet);
    const dblTotal = dblNet + dblGst;
    
    const trpNet = z(r.trp || 0);
    const trpGst = trpNet * gstRateFor(trpNet);
    const trpTotal = trpNet + trpGst;

    const quadNet = z(r.quad || 0);
    const quadGst = quadNet * gstRateFor(quadNet);
    const quadTotal = quadNet + quadGst;

    const lunchNet = r.lunch_total || 0;
    const lunchGst = lunchNet * gstRateFor(lunchNet);
    const lunchTotal = lunchNet + lunchGst;

    const dinnerNet = r.dinner_total || 0;
    const dinnerGst = dinnerNet * gstRateFor(dinnerNet);
    const dinnerTotal = dinnerNet + dinnerGst;

    return {
      ...r, dyn,
      sglNet, sglGst, sglTotal, dblNet, dblGst, dblTotal, trpNet, trpGst, trpTotal,
      quadNet, quadGst, quadTotal, lunchNet, lunchGst, lunchTotal, dinnerNet, dinnerGst, dinnerTotal,
    };
  });

  // Step 2: Sum up the totals
  const totals = computedRows.reduce((acc, r) => ({
    sglNet: acc.sglNet + r.sglNet, sglGst: acc.sglGst + r.sglGst, sglTotal: acc.sglTotal + r.sglTotal,
    dblNet: acc.dblNet + r.dblNet, dblGst: acc.dblGst + r.dblGst, dblTotal: acc.dblTotal + r.dblTotal,
    trpNet: acc.trpNet + r.trpNet, trpGst: acc.trpGst + r.trpGst, trpTotal: acc.trpTotal + r.trpTotal,
    quadNet: acc.quadNet + r.quadNet, quadGst: acc.quadGst + r.quadGst, quadTotal: acc.quadTotal + r.quadTotal,
    lunchNet: acc.lunchNet + r.lunchNet, lunchGst: acc.lunchGst + r.lunchGst, lunchTotal: acc.lunchTotal + r.lunchTotal,
    dinnerNet: acc.dinnerNet + r.dinnerNet, dinnerGst: acc.dinnerGst + r.dinnerGst, dinnerTotal: acc.dinnerTotal + r.dinnerTotal,
    dynNet: acc.dynNet + (r.dyn?.net ?? 0), dynTotal: acc.dynTotal + (r.dyn?.total ?? 0),
  }), { sglNet:0, sglGst:0, sglTotal:0, dblNet:0, dblGst:0, dblTotal:0, trpNet:0, trpGst:0, trpTotal:0, quadNet:0, quadGst:0, quadTotal:0, lunchNet:0, lunchGst:0, lunchTotal:0, dinnerNet:0, dinnerGst:0, dinnerTotal:0, dynNet:0, dynTotal:0 });
  const dynamicNights = computedRows.filter((r) => r.dyn).length;


  // Step 3: Display the table
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
          {computedRows.map((r) => (
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
              
              {r.dyn ? (
                /* Dynamic mode — one consolidated line for the allocated room mix */
                <td className="p-1.5" colSpan={4}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{r.mix_label || "No rooms"}</span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{inr(r.dyn.total)}</span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        Net: {inr(r.dyn.net)} + GST {inr(r.dyn.gst)} · {inr(r.dyn.total / pax)}/person
                      </span>
                    </span>
                  </div>
                </td>
              ) : (
                <>
              {/* SGL */}
              <td className={td}>
                <div className="text-[#0F172A] font-semibold">{r.sglTotal ? inr(r.sglTotal) : '—'}</div>
                {r.sglTotal > 0 && <div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.sglNet)} + GST {(gstRateFor(r.sglNet) * 100).toFixed(0)}%</div>}
              </td>
              
              {/* DBL */}
              <td className={td}>
                <div className="text-[#0F172A] font-semibold">{r.dblTotal ? inr(r.dblTotal) : '—'}</div>
                {r.dblTotal > 0 && <div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.dblNet)} + GST {(gstRateFor(r.dblNet) * 100).toFixed(0)}%</div>}
              </td>
              
              {/* TRP */}
              <td className={td}>
                <div className="text-[#0F172A] font-semibold">{r.trpTotal ? inr(r.trpTotal) : '—'}</div>
                {r.trpTotal > 0 && <div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.trpNet)} + GST {(gstRateFor(r.trpNet) * 100).toFixed(0)}%</div>}
              </td>
              
              {/* QUAD */}
              <td className={td}>
                <div className="text-[#0F172A] font-semibold">{r.quadTotal ? inr(r.quadTotal) : '—'}</div>
                {r.quadTotal > 0 && <div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.quadNet)} + GST {(gstRateFor(r.quadNet) * 100).toFixed(0)}%</div>}
              </td>
                </>
              )}

              
              <td className="p-1.5">{r.lunch_source}</td>
              {/* Lunch */}
              <td className={td}>
                <div className="text-[#0F172A] font-semibold">{r.lunchTotal ? inr(r.lunchTotal) : '—'}</div>
                {r.lunchTotal > 0 && <div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.lunchNet)} + GST {(gstRateFor(r.lunchNet) * 100).toFixed(0)}%</div>}
              </td>
              
              <td className="p-1.5">{r.dinner_source}</td>
              {/* Dinner */}
              <td className={td}>
                <div className="text-[#0F172A] font-semibold">{r.dinnerTotal ? inr(r.dinnerTotal) : '—'}</div>
                {r.dinnerTotal > 0 && <div className="text-[11px] text-[#64748B] font-normal">Net: {inr(r.dinnerNet)} + GST {(gstRateFor(r.dinnerNet) * 100).toFixed(0)}%</div>}
              </td>
            </tr>
          ))}
          {sheet.rows.length === 0 && (
            <tr><td colSpan={11} className="p-3 text-center text-muted-foreground">No overnight stays selected.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-muted/30 font-medium">
            <td className="p-1.5" colSpan={3}>Subtotal (Per Night)</td>
            <td className={td}>{inr(totals.sglNet / n)}</td>
            <td className={td}>{inr(totals.dblNet / n)}</td>
            <td className={td}>{inr(totals.trpNet / n)}</td>
            <td className={td}>{inr(totals.quadNet / n)}</td>
            <td className="p-1.5" />
            <td className={td}>{inr(totals.lunchNet / n)}</td>
            <td className="p-1.5" />
            <td className={td}>{inr(totals.dinnerNet / n)}</td>
          </tr>
          <tr className="bg-primary/10 font-bold">
            <td className="p-1.5" colSpan={3}>Total ({sheet.nights} Nights)</td>
            <td className={td}>{inr(totals.sglTotal)}</td>
            <td className={td}>{inr(totals.dblTotal)}</td>
            <td className={td}>{inr(totals.trpTotal)}</td>
            <td className={td}>{inr(totals.quadTotal)}</td>
            <td className="p-1.5" />
            <td className={td}>{inr(totals.lunchTotal)}</td>
            <td className="p-1.5" />
            <td className={td}>{inr(totals.dinnerTotal)}</td>
          </tr>
          {dynamicNights > 0 && (
            <tr className="bg-accent/10 font-semibold">
              <td className="p-1.5" colSpan={3}>Dynamic rooms ({dynamicNights} night(s))</td>
              <td className="p-1.5" colSpan={4}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase text-muted-foreground">Allocated mix</span>
                  <span className="text-right">
                    <span className="block tabular-nums">{inr(totals.dynTotal)}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground tabular-nums">
                      {inr(totals.dynTotal / pax)}/person ({pax} pax)
                    </span>
                  </span>
                </div>
              </td>
              <td className="p-1.5" colSpan={4} />
            </tr>
          )}
          <HotelMarkupRows totals={totals} pct={pct} pax={pax} />

        </tfoot>
      </table>
    </Card>
  );
}

function HotelMarkupRows({
  totals, pct, pax,
}: { totals: { sglTotal: number; dblTotal: number; trpTotal: number; quadTotal: number; lunchTotal: number; dinnerTotal: number }; pct: { mk: number; gst: number }; pax: number }) {
  const cells = [totals.sglTotal, totals.dblTotal, totals.trpTotal, totals.quadTotal];
  const shares = [1, 2, 3, 4];
  
  // UPDATED: GST is now applied on the (Total + Markup), NOT on the markup alone!
  const rows: [string, (v: number) => number][] = [
    [`Markup ${pct.mk}%`, (v) => v * (pct.mk / 100)],
    [`GST ${pct.gst}% (on Base+Markup)`, (v) => (v + (v * (pct.mk / 100))) * (pct.gst / 100)],
    ["Per person (share)", (v) => (v * (1 + pct.mk / 100)) * (1 + pct.gst / 100)],
  ];

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
          <td className={td}>{inr(fn(totals.lunchTotal))}</td>
          <td className="p-1.5" />
          <td className={td}>{inr(fn(totals.dinnerTotal))}</td>
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
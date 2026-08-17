import { useMemo, useRef, useState } from "react";
import { Printer, FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr, fmtDateShort } from "@/lib/format";
import {
  exportRateSheetExcel,
  printSection,
  type RateSheetExportRow,
} from "@/lib/wizard/ratesheet-export";
import { useDB } from "@/lib/mock-store";

import {
  landMarkup,
  landGst,
  hotelsMarkup,
  hotelsGst,
  effectivePaxForPricing,
  gstRateFor,
} from "@/lib/wizard/calc";
import {
  buildLandPart,
  buildHotelMealSheet,
  buildRateSheet,
  mixTotals,
  type LandPartSheet,
  type HotelMealSheet,
  type RateSheetGroup,
  type SheetOption,
  type LandDayRow,
} from "@/lib/wizard/costsheet";

import type {
  QuoteDraft,
  HotelOption,
  EntranceCat,
  CostingSelection,
} from "@/lib/wizard/types";

type Bucket = "transport" | "guide" | "entrances" | "activities" | "misc";
type SetDraft = (p: Partial<QuoteDraft>) => void;
type GuideLang = "Hindi" | "English" | "Language";

export function CostingSheet({
  draft,
  set,
}: {
  draft: QuoteDraft;
  set?: SetDraft;
}) {
  const d = useDB();
  const options = draft.hotel_options ?? [];
  const [tab, setTab] = useState<string>(options[0]?.key ?? "A");

  /*
   * IMPORTANT:
   *
   * Activity & Experiences are normalized here as TOTAL activity amounts.
   *
   * Example:
   * Batik Art = 10000
   * VIP Darshan = 2800
   * Boat Ride = 3000
   *
   * Activity Total = 15800
   *
   * This total must NEVER be multiplied by pax.
   */
  const pricingPax = Math.max(1, effectivePaxForPricing(draft));

  const land = useMemo<LandPartSheet>(
    () => normalizeActivityPricing(buildLandPart(draft, d), d, pricingPax),
    [draft, d, pricingPax],
  );

  if (options.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Add at least one Accommodation Option to see the costing sheet.
      </Card>
    );
  }

  const toggle = (
    bucket: Bucket,
    day: number,
    id: string,
    checkedByDay: Record<number, string[]>,
    allDays?: number[],
  ) => {
    if (!set) return;

    const sel: CostingSelection = {
      ...(draft.costing_selection ?? {}),
    };

    const map = {
      ...((sel[bucket] as Record<number, string[]>) ?? {}),
    };

    const daysToUpdate =
      day === -1
        ? (allDays ?? draft.routing?.map((rd) => rd.day) ?? [])
        : [day];

    if (daysToUpdate.length === 0) return;

    daysToUpdate.forEach((dayNum) => {
      const current = map[dayNum] ?? checkedByDay[dayNum] ?? [];

      if (bucket === "guide" && id.includes("::")) {
        const prefix = `${id.split("::")[0]}::`;
        const others = current.filter((x) => !x.startsWith(prefix));

        map[dayNum] = current.includes(id)
          ? others
          : [...others, id];
      } else {
        map[dayNum] = current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id];
      }
    });

    (sel as Record<string, unknown>)[bucket] = map;

    set({
      costing_selection: sel,
    });
  };

  const toggleCat = (
    day: number,
    cat: EntranceCat,
    allDays?: number[],
  ) => {
    if (!set) return;

    const sel: CostingSelection = {
      ...(draft.costing_selection ?? {}),
    };

    const map = {
      ...(sel.entrance_cats ?? {}),
    };

    let daysToUpdate: number[];

    if (day === -1) {
      daysToUpdate =
        allDays ??
        (draft.routing?.map((rd) => rd.day) ??
          Object.keys(map).map(Number));

      if (daysToUpdate.length === 0) return;
    } else {
      daysToUpdate = [day];
    }

    daysToUpdate.forEach((dayNum) => {
      const current = map[dayNum] ?? ([] as EntranceCat[]);

      map[dayNum] = current.includes(cat) ? [] : [cat];
    });

    sel.entrance_cats = map;

    set({
      costing_selection: sel,
    });
  };

  const toggleGuideLangGlobal = (lang: GuideLang) => {
    if (!set) return;

    const sel: CostingSelection = {
      ...(draft.costing_selection ?? {}),
    };

    const map: Record<number, string[]> = {
      ...(sel.guide ?? {}),
    };

    const rowsWithGuides = land.rows.filter(
      (r) => r.guide_opts.length > 0,
    );

    // 检查是否所有行的所有导游前缀都已选中了该语言
    let allSelected = true;
    for (const row of rowsWithGuides) {
      const prefixes = Array.from(new Set(row.guide_opts.map((o) => o.id.split("::")[0])));
      const current = map[row.day] ?? row.guide_opts.filter((o) => o.checked).map((o) => o.id);
      const rowHasAll = prefixes.every((p) => current.includes(`${p}::${lang}`));
      if (!rowHasAll) {
        allSelected = false;
        break;
      }
    }

    // 如果已经全选了，则本次操作是取消全选；否则是全选
    const shouldSelect = !allSelected;

    rowsWithGuides.forEach((row) => {
      const prefixes = Array.from(
        new Set(
          row.guide_opts.map(
            (o) => o.id.split("::")[0],
          ),
        ),
      );

      if (prefixes.length === 0) return;

      const current =
        map[row.day] ??
        row.guide_opts
          .filter((o) => o.checked)
          .map((o) => o.id);

      const withoutLines = current.filter(
        (x) =>
          !prefixes.some(
            (p) => x.startsWith(`${p}::`),
          ),
      );

      if (shouldSelect) {
        map[row.day] = [
          ...withoutLines,
          ...prefixes.map(
            (p) => `${p}::${lang}`,
          ),
        ];
      } else {
        map[row.day] = withoutLines;
      }
    });

    (sel as Record<string, unknown>)["guide"] = map;

    set({
      costing_selection: sel,
    });
  };

  return (
    <Tabs
      value={
        options.some((o) => o.key === tab)
          ? tab
          : options[0].key
      }
      onValueChange={setTab}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="section-label">
          Costing — {options.length} variation
          {options.length > 1 ? "s" : ""}
        </div>

        <TabsList className="flex-wrap h-auto">
          {options.map((o) => (
            <TabsTrigger
              key={o.key}
              value={o.key}
              className="text-xs"
            >
              {o.category ||
                o.label ||
                `Option ${o.key}`}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {options.map((o) => (
        <TabsContent
          key={o.key}
          value={o.key}
          className="space-y-4 mt-3"
        >
          <Variation
            draft={draft}
            set={set}
            d={d}
            opt={o}
            land={land}
            toggle={toggle}
            toggleCat={toggleCat}
            toggleGuideLangGlobal={toggleGuideLangGlobal}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

interface Handlers {
  toggle: (
    bucket: Bucket,
    day: number,
    id: string,
    checkedByDay: Record<number, string[]>,
    allDays?: number[],
  ) => void;

  toggleCat: (
    day: number,
    cat: EntranceCat,
    allDays?: number[],
  ) => void;

  toggleGuideLangGlobal: (
    lang: GuideLang,
  ) => void;
}

function Variation({
  draft,
  set,
  d,
  opt,
  land,
  toggle,
  toggleCat,
  toggleGuideLangGlobal,
}: {
  draft: QuoteDraft;
  set?: SetDraft;
  d: ReturnType<typeof useDB>;
  opt: HotelOption;
  land: LandPartSheet;
} & Handlers) {
  const hotels = useMemo<HotelMealSheet>(
    () =>
      buildHotelMealSheet(
        draft,
        d,
        opt,
      ),
    [draft, d, opt],
  );

  const sheets = useMemo<RateSheetGroup[]>(
    () =>
      buildRateSheet(
        draft,
        d,
        opt,
        draft.transport ?? [],
      ),
    [draft, d, opt],
  );

  const pax = Math.max(
    1,
    effectivePaxForPricing(draft),
  );

  const landPct = {
    mk: landMarkup(draft) * 100,
    gst: landGst(draft) * 100,
  };

  const hotelPct = {
    mk: hotelsMarkup(draft) * 100,
    gst: hotelsGst(draft) * 100,
  };

  const printRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-4" ref={printRef}>
      <div className="flex justify-end no-print">
        <Button
          size="sm"
          variant="outline"
          onClick={() => printSection(printRef.current)}
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Costing (Landscape)
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-4 items-start min-w-max">
          <LandPartBlock
            land={land}
            pax={pax}
            pct={landPct}
            toggle={toggle}
            toggleCat={toggleCat}
            toggleGuideLangGlobal={
              toggleGuideLangGlobal
            }
          />

          <HotelMealBlock
            sheet={hotels}
            pax={pax}
            pct={hotelPct}
          />
        </div>
      </div>

      <RateSheetBlock
        groups={sheets}
        land={land}
        pax={pax}
        landPct={landPct}
        hotelPct={hotelPct}
        db={d}
        draft={draft}
        set={set}
        optionKey={opt.key}
        optionLabel={opt.category || opt.label || `Option ${opt.key}`}
      />
    </div>
  );
}


const th =
  "p-1.5 text-right font-medium whitespace-nowrap";

const thL =
  "p-1.5 text-left font-medium whitespace-nowrap";

const td =
  "p-1.5 text-right tabular-nums whitespace-nowrap";

/**
 * Existing calculation used by all NON-ACTIVITY categories.
 *
 * DO NOT change this because Activity & Experiences
 * has its own calculation below.
 */
function applyMarkupAndGst(
  base: number,
  mk: number,
  gst: number,
  pax: number,
) {
  const markup = base * (mk / 100);
  const basePlusMarkup = base + markup;
  const gstAmt =
    basePlusMarkup * (gst / 100);

  const total =
    basePlusMarkup + gstAmt;

  return {
    markup,
    gstAmt,
    total,
    per_person: total / pax,
  };
}

/**
 * ACTIVITY & EXPERIENCES ONLY
 *
 * The activity amount is a GROUP TOTAL.
 *
 * Example:
 *
 * Base Total = ₹15,800
 * Pax = 7
 *
 * Base Per Person:
 * Math.round(15800 / 7)
 * = ₹2,257
 *
 * Markup:
 * Math.round(2257 × 10%)
 * = ₹225
 *
 * Subtotal:
 * ₹2,257 + ₹225
 * = ₹2,482
 *
 * GST:
 * Math.round(2482 × 5%)
 * = ₹124
 *
 * Final:
 * ₹2,482 + ₹124
 * = ₹2,606
 *
 * This function is used ONLY for Activities.
 */
function applyActivityMarkupAndGst(
  baseTotal: number,
  mk: number,
  gst: number,
  pax: number,
) {
  const safePax = Math.max(
    1,
    Math.round(pax),
  );

  const perPersonBase = Math.round(
    baseTotal / safePax,
  );

  const markup = Math.round(
    perPersonBase * (mk / 100),
  );

  const basePlusMarkup =
    perPersonBase + markup;

  const gstAmt = Math.round(
    basePlusMarkup * (gst / 100),
  );

  const finalPerPerson =
    basePlusMarkup + gstAmt;

  /*
   * The actual activity total remains unchanged.
   * We do NOT multiply the activity total by pax.
   */
  return {
    baseTotal,
    perPersonBase,
    markup,
    basePlusMarkup,
    gstAmt,
    finalPerPerson,
    finalTotal: baseTotal,
  };
}

function MarkupRows({
  label,
  values,
  mk,
  gst,
  pax,
  leadSpan,
}: {
  label: string;
  values: number[];
  mk: number;
  gst: number;
  pax: number;
  leadSpan: number;
}) {
  const rows: [
    string,
    (v: number) => number
  ][] = [
    [
      `Markup ${mk}%`,
      (v) =>
        applyMarkupAndGst(
          v,
          mk,
          gst,
          pax,
        ).markup,
    ],
    [
      `GST ${gst}% (on Base+Markup)`,
      (v) =>
        applyMarkupAndGst(
          v,
          mk,
          gst,
          pax,
        ).gstAmt,
    ],
    [
      `Per person (${pax} pax)`,
      (v) =>
        applyMarkupAndGst(
          v,
          mk,
          gst,
          pax,
        ).per_person,
    ],
  ];

  return (
    <>
      {rows.map(([name, fn], i) => (
        <tr
          key={name}
          className={
            i === 2
              ? "bg-primary/10 font-semibold"
              : "text-muted-foreground"
          }
        >
          <td
            className="p-1.5 text-[10px] uppercase"
            colSpan={leadSpan}
          >
            {i === 0
              ? `${label} · `
              : ""}
            {name}
          </td>

          {values.map((v, j) => (
            <td
              key={j}
              className={td}
            >
              {inr(fn(v))}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Activity slab helper.
 *
 * Activity prices are treated as TOTAL amounts.
 */
function isSlabOption(
  opt: SheetOption,
): boolean {
  const text =
    `${opt.sub || ""} ${opt.label || ""}`.toLowerCase();

  return (
    /\bslab\b|\btotal\b|\/total\b/.test(
      text,
    )
  );
}

function pickActivitySlab<
  T extends {
    from_pax: number;
    to_pax: number;
    price: number;
  },
>(
  slabs: T[],
  pax: number,
): T {
  const sorted = [...slabs].sort(
    (a, b) =>
      a.from_pax - b.from_pax,
  );

  return (
    sorted.find(
      (s) =>
        pax >= s.from_pax &&
        pax <= s.to_pax,
    ) ??
    (
      pax < sorted[0].from_pax
        ? sorted[0]
        : sorted[sorted.length - 1]
    )
  );
}

/**
 * Activity amount shown in the activity column.
 *
 * Activity is a TOTAL amount.
 *
 * Therefore:
 * ₹10,000 stays ₹10,000.
 * It is NOT divided by pax in the activity list.
 */
function getActivityDisplayAmount(
  opt: SheetOption,
): number {
  return opt.amount;
}

/**
 * IMPORTANT ACTIVITY NORMALIZATION
 *
 * Every selected Activity & Experience amount
 * is treated as a TOTAL/group amount.
 *
 * It is never multiplied by pax.
 */
function normalizeActivityPricing(
  land: LandPartSheet,
  db: ReturnType<typeof useDB>,
  pax: number,
): LandPartSheet {
  const safePax = Math.max(
    1,
    pax,
  );

  const rows = land.rows.map(
    (row) => {
      const destination =
        db.destination_cities.find(
          (city) =>
            city.name
              .trim()
              .toLowerCase() ===
            row.city
              .trim()
              .toLowerCase(),
        );

      const activity_opts =
        row.activity_opts.map(
          (opt) => {
            const activity =
              db.activities.find(
                (a) => {
                  const sameName =
                    a.activity_name
                      .trim()
                      .toLowerCase() ===
                    opt.label
                      .trim()
                      .toLowerCase();

                  const sameDestination =
                    destination
                      ? a.destination_id ===
                        destination.id
                      : true;

                  return (
                    sameName &&
                    sameDestination
                  );
                },
              );

            if (!activity) {
              /*
               * Existing option amount is already
               * considered a total amount.
               */
              return {
                ...opt,
                sub:
                  opt.sub ??
                  `${inr(
                    opt.amount,
                  )} total`,
              };
            }

            const slabs =
              activity.pricing_slabs ??
              [];

            /*
             * If pricing slabs exist, select the
             * correct slab for pax.
             *
             * IMPORTANT:
             * The selected slab price is a TOTAL.
             */
            if (slabs.length > 0) {
              const slab =
                pickActivitySlab(
                  slabs,
                  safePax,
                );

              return {
                ...opt,
                amount: slab.price,
                sub: `Slab ${slab.from_pax}-${slab.to_pax}: ${inr(
                  slab.price,
                )} total`,
              };
            }

            /*
             * No slabs:
             *
             * Activity price is also treated as
             * the TOTAL amount for this costing.
             */
            return {
              ...opt,
              amount:
                activity.price ??
                opt.amount,
              sub:
                activity.price !=
                null
                  ? `${inr(
                      activity.price,
                    )} total`
                  : `${inr(
                      opt.amount,
                    )} total`,
            };
          },
        );

      return {
        ...row,
        activity_opts,
      };
    },
  );

  /*
   * CRITICAL:
   *
   * Activity total =
   * sum of selected activity amounts.
   *
   * NEVER:
   * activity amount × pax
   */
  const activities_total =
    rows.reduce(
      (sum, row) =>
        sum +
        row.activity_opts.reduce(
          (
            rowSum,
            option,
          ) => {
            if (!option.checked) {
              return rowSum;
            }

            return (
              rowSum +
              option.amount
            );
          },
          0,
        ),
      0,
    );

  return {
    ...land,
    rows,
    activities_total,
  };
}

function OptionCell({
  opts,
  bucket,
  day,
  onToggle,
  pax,
}: {
  opts: SheetOption[];
  bucket: Bucket;
  day: number;
  onToggle: Handlers["toggle"];
  pax: number;
}) {
  if (opts.length === 0) {
    return (
      <td className="p-1.5 text-right text-muted-foreground">
        —
      </td>
    );
  }

  const checkedByDay = {
    [day]: opts
      .filter((o) => o.checked)
      .map((o) => o.id),
  };

  const perPersonBuckets: Bucket[] = [
    "entrances",
    "misc",
  ];

  const showPerPerson =
    perPersonBuckets.includes(
      bucket,
    );

  return (
    <td className="p-1.5 align-top">
      <div className="space-y-1">
        {opts.map((o) => {
          /*
           * ACTIVITY:
           * Always show the TOTAL amount.
           *
           * Entrances/Misc:
           * Keep existing per-person behavior.
           */
          const displayAmount =
            bucket === "activities"
              ? getActivityDisplayAmount(o)
              : showPerPerson
                ? getPerPersonAmount(
                    o,
                    pax,
                  )
                : o.amount;

          return (
            <label
              key={o.id}
              className="flex items-start gap-1.5 cursor-pointer"
            >
              <Checkbox
                checked={o.checked}
                onCheckedChange={() =>
                  onToggle(
                    bucket,
                    day,
                    o.id,
                    checkedByDay,
                  )
                }
                className="mt-0.5"
              />

              <span className="flex-1 min-w-0">
                <span className="block truncate max-w-[150px]">
                  {o.label}
                </span>

                {o.sub && (
                  <span className="block text-[10px] text-muted-foreground truncate max-w-[150px]">
                    {o.sub}
                  </span>
                )}
              </span>

              <span
                className={`tabular-nums ${
                  o.checked
                    ? ""
                    : "line-through text-muted-foreground"
                }`}
              >
                {inr(displayAmount)}
              </span>
            </label>
          );
        })}
      </div>
    </td>
  );
}

function getPerPersonAmount(
  opt: SheetOption,
  pax: number,
): number {
  const safePax = Math.max(
    1,
    pax,
  );

  const text =
    `${opt.sub || ""} ${opt.label || ""}`;

  if (
    /per[_\s]person/i.test(
      text,
    )
  ) {
    return opt.amount;
  }

  return opt.amount / safePax;
}

function LandPartBlock({
  land,
  pax,
  pct,
  toggle,
  toggleCat,
  toggleGuideLangGlobal,
}: {
  land: LandPartSheet;
  pax: number;
  pct: {
    mk: number;
    gst: number;
  };
} & Handlers) {
  const cats: [
    EntranceCat,
    string
  ][] = [
    ["indian", "Indian"],
    ["foreign", "Foreigner"],
    ["student", "Student"],
  ];

  const guideLangs: GuideLang[] = [
    "Hindi",
    "English",
    "Language",
  ];

  const firstRow = land.rows[0];

  const allDayNumbers =
    land.rows.map((r) => r.day);

  const checkedByDay = (
    bucket: Bucket,
  ): Record<
    number,
    string[]
  > => {
    const key = {
      transport:
        "transport_opts",
      guide: "guide_opts",
      entrances:
        "entrance_opts",
      activities:
        "activity_opts",
      misc: "misc_opts",
    }[bucket] as keyof LandDayRow;

    const out: Record<
      number,
      string[]
    > = {};

    land.rows.forEach((r) => {
      out[r.day] = (
        r[key] as SheetOption[]
      )
        .filter(
          (o) => o.checked,
        )
        .map((o) => o.id);
    });

    return out;
  };

  const headerGuideLangChecked = (
    lang: GuideLang,
  ): boolean => {
    if (
      !firstRow ||
      firstRow.guide_opts.length === 0
    ) {
      return false;
    }

    const prefixes =
      Array.from(
        new Set(
          firstRow.guide_opts.map(
            (o) =>
              o.id.split("::")[0],
          ),
        ),
      );

    if (prefixes.length === 0) {
      return false;
    }

    return prefixes.every(
      (p) =>
        firstRow.guide_opts.find(
          (o) =>
            o.id ===
            `${p}::${lang}`,
        )?.checked ??
        false,
    );
  };

  return (
    <Card className="p-3 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="section-label">
          Land Part
        </div>

        <Badge
          variant="secondary"
          className="text-[10px]"
        >
          Markup {pct.mk}% · GST{" "}
          {pct.gst}% applied per person
        </Badge>
      </div>

      <table className="text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className={thL}>
              Day
            </th>

            <th className={thL}>
              Date
            </th>

            <th className={thL}>
              Route
            </th>

            <th className={thL}>
              City / Tour
            </th>

            <th
              className={thL}
              style={{
                minWidth:
                  "320px",
                verticalAlign:
                  "top",
              }}
            >
              <div className="mb-2 text-center">
                Vehicle Options
              </div>

              <div
                className="grid items-start gap-6 font-normal"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(
                    firstRow
                      ?.transport_opts
                      .length ??
                      1,
                    1,
                  )}, minmax(150px, 1fr))`,
                }}
              >
                {firstRow?.transport_opts.map(
                  (o) => (
                    <label
                      key={o.id}
                      className="flex min-w-0 flex-col items-center gap-1 text-[9px] cursor-pointer text-center"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Checkbox
                          checked={
                            o.checked
                          }
                          onCheckedChange={() =>
                            toggle(
                              "transport",
                              -1,
                              o.id,
                              checkedByDay(
                                "transport",
                              ),
                              allDayNumbers,
                            )
                          }
                          className="shrink-0"
                        />

                        <span className="normal-case whitespace-nowrap leading-tight">
                          {o.label}
                        </span>
                      </div>

                      <span className="text-[11px] font-semibold tabular-nums text-foreground">
                        {inr(
                          o.amount,
                        )}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </th>

            <th
              className={thL}
              style={{
                minWidth:
                  "180px",
                verticalAlign:
                  "top",
              }}
            >
              <div className="mb-1">
                Guide Options
              </div>

              <div className="flex flex-wrap gap-2 font-normal">
                {guideLangs.map(
                  (lang) => (
                    <label
                      key={lang}
                      className="flex items-center gap-1 text-[9px] cursor-pointer"
                    >
                      <Checkbox
                        checked={headerGuideLangChecked(
                          lang,
                        )}
                        onCheckedChange={() =>
                          toggleGuideLangGlobal(
                            lang,
                          )
                        }
                      />

                      <span className="normal-case">
                        {lang}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </th>

            <th
              className={thL}
              style={{
                minWidth:
                  "150px",
                verticalAlign:
                  "top",
              }}
            >
              <div className="mb-1">
                Monument Entrances
              </div>

              <div className="flex gap-1 font-normal">
                {cats.map(
                  ([c, label]) => (
                    <label
                      key={c}
                      className="flex items-center gap-1 text-[9px] cursor-pointer"
                    >
                      <Checkbox
                        checked={
                          firstRow
                            ?.entrance_cats[
                            c
                          ] ??
                          false
                        }
                        onCheckedChange={() =>
                          toggleCat(
                            -1,
                            c,
                            allDayNumbers,
                          )
                        }
                        className="mt-0.5"
                      />

                      {label}
                    </label>
                  ),
                )}
              </div>
            </th>

            <th className={thL}>
              Activity &amp;
              Experiences
            </th>

            <th className={thL}>
              Miscellaneous
            </th>
          </tr>
        </thead>

        <tbody>
          {land.rows.map(
            (r: LandDayRow) => {
              const selectedGuides =
                r.guide_opts.filter(
                  (o) =>
                    o.checked,
                );

              return (
                <tr
                  key={r.day}
                  className="border-t align-top"
                >
                  <td className="p-1.5">
                    {r.day}
                  </td>

                  <td className="p-1.5 whitespace-nowrap">
                    {r.date
                      ? fmtDateShort(
                          r.date,
                        )
                      : "—"}
                  </td>

                  <td className="p-1.5">
                    {r.route}
                  </td>

                  <td className="p-1.5">
                    <div>
                      {r.city}
                    </div>

                    <div className="text-[10px] text-muted-foreground">
                      {r.tours}
                    </div>
                  </td>

                  <td className="p-1.5 align-top">
                    {(() => {
                      const selected =
                        r.transport_opts.filter(
                          (o) =>
                            o.checked,
                        );

                      if (
                        selected.length ===
                        0
                      ) {
                        return (
                          <div className="text-right text-muted-foreground">
                            —
                          </div>
                        );
                      }

                      return (
                        <div
                          className="grid items-start gap-6"
                          style={{
                            gridTemplateColumns: `repeat(${Math.max(
                              r
                                .transport_opts
                                .length,
                              1,
                            )}, minmax(150px, 1fr))`,
                          }}
                        >
                          {r.transport_opts.map(
                            (o) => (
                              <div
                                key={o.id}
                                className={`text-center tabular-nums font-medium ${
                                  o.checked
                                    ? ""
                                    : "text-muted-foreground"
                                }`}
                              >
                                {o.checked
                                  ? inr(
                                      o.amount,
                                    )
                                  : "—"}
                              </div>
                            ),
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  <td className="p-1.5 align-top">
                    {selectedGuides.length ===
                    0 ? (
                      <div className="text-right text-muted-foreground">
                        —
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {selectedGuides.map(
                          (o) => (
                            <div
                              key={o.id}
                              className="flex justify-between gap-2"
                            >
                              <span className="truncate max-w-[120px]">
                                {o.label}

                                {o.sub && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    {o.sub}
                                  </span>
                                )}
                              </span>

                              {/* ✅ 已修改：此处不再除以 pax，直接展示当天总价 */}
                              <span className="tabular-nums font-medium">
                                {inr(o.amount)}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </td>

                  <td className="p-1.5 align-top">
                    {r.entrance_opts
                      .length ===
                    0 ? (
                      <div className="text-right text-muted-foreground">
                        —
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {r.entrance_opts.map(
                          (o) => {
                            const perPerson =
                              getPerPersonAmount(
                                o,
                                pax,
                              );

                            return (
                              <label
                                key={o.id}
                                className="flex items-start gap-1.5 cursor-pointer"
                              >
                                <Checkbox
                                  checked={
                                    o.checked
                                  }
                                  onCheckedChange={() =>
                                    toggle(
                                      "entrances",
                                      r.day,
                                      o.id,
                                      checkedByDay(
                                        "entrances",
                                      ),
                                    )
                                  }
                                  className="mt-0.5"
                                />

                                <span className="flex-1 truncate max-w-[150px]">
                                  {o.label}
                                </span>

                                <span
                                  className={`tabular-nums ${
                                    o.checked
                                      ? ""
                                      : "line-through text-muted-foreground"
                                  }`}
                                >
                                  {inr(
                                    perPerson,
                                  )}
                                </span>
                              </label>
                            );
                          },
                        )}
                      </div>
                    )}
                  </td>

                  {/* ACTIVITY & EXPERIENCES */}
                  <td className="p-1.5 align-top">
                    <OptionCell
                      opts={
                        r.activity_opts
                      }
                      bucket="activities"
                      day={r.day}
                      onToggle={toggle}
                      pax={pax}
                    />
                  </td>

                  <td className="p-1.5 align-top">
                    <OptionCell
                      opts={
                        r.misc_opts
                      }
                      bucket="misc"
                      day={r.day}
                      onToggle={toggle}
                      pax={pax}
                    />
                  </td>
                </tr>
              );
            },
          )}

          {land.rows.length ===
            0 && (
            <tr>
              <td
                colSpan={9}
                className="p-3 text-center text-muted-foreground"
              >
                No routing days yet.
              </td>
            </tr>
          )}
        </tbody>

        <tfoot>
          {(() => {
            // ---------- FIXED VEHICLE TOTAL CALCULATION ----------
            // 1. Collect all unique vehicle labels from all rows.
            const allVehicleLabels = Array.from(
              new Set(
                land.rows.flatMap(row =>
                  row.transport_opts.map(o => o.label)
                )
              )
            );

            // 2. For each label, sum only the checked amounts across all days.
            const vehicleTotals = allVehicleLabels.map(label =>
              land.rows.reduce((sum, row) => {
                const opt = row.transport_opts.find(
                  o => o.label === label && o.checked
                );
                return sum + (opt ? opt.amount : 0);
              }, 0)
            );

            // 3. Compute markup, GST, and per‑person for each vehicle.
            const vehicleMarkup = vehicleTotals.map(total =>
              total * (pct.mk / 100)
            );

            const vehicleGst = vehicleTotals.map((total, i) =>
              (total + vehicleMarkup[i]) * (pct.gst / 100)
            );

            const vehiclePerPerson = vehicleTotals.map((total, i) =>
              (total + vehicleMarkup[i] + vehicleGst[i]) / pax
            );

            // ===== FIXED: Activity total markup and GST on total, not per-person =====
            const activityMarkupTotal = land.activities_total * (pct.mk / 100);
            const activityGstTotal = (land.activities_total + activityMarkupTotal) * (pct.gst / 100);
            const activityTotalFinal = land.activities_total + activityMarkupTotal + activityGstTotal;
            const activityPerPerson = activityTotalFinal / pax;

            const renderVehicleCells =
              (values: number[], empty = false) => (
                <td className="p-1.5 align-top">
                  <div
                    className="grid items-start gap-6"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(
                        allVehicleLabels.length,
                        1,
                      )}, minmax(150px, 1fr))`,
                    }}
                  >
                    {allVehicleLabels.map((label, index) => (
                      <div
                        key={`${label}-${index}`}
                        className={`text-center tabular-nums ${
                          vehicleTotals[index] > 0
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {empty ? "—" : inr(values[index] ?? 0)}
                      </div>
                    ))}
                  </div>
                </td>
              );

            return (
              <>
                <tr className="border-t-2 bg-primary/5 font-semibold">
                  <td
                    className="p-1.5"
                    colSpan={4}
                  >
                    Line Total
                  </td>

                  {renderVehicleCells(vehicleTotals)}

                  <td
                    className={td}
                  >
                    {inr(
                      land.guide_total,
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      land.entrances_total,
                    )}
                  </td>

                  {/* ACTIVITY TOTAL */}
                  <td
                    className={`${td} font-semibold`}
                  >
                    {inr(
                      land.activities_total,
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      land.misc_total,
                    )}
                  </td>
                </tr>

                <tr className="text-muted-foreground">
                  <td
                    className="p-1.5 text-[10px] uppercase"
                    colSpan={4}
                  >
                    Markup {pct.mk}%
                  </td>

                  {renderVehicleCells(vehicleMarkup)}

                  <td
                    className={td}
                  >
                    {inr(
                      land.guide_total *
                        (pct.mk /
                          100),
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      land.entrances_total *
                        (pct.mk /
                          100),
                    )}
                  </td>

                  {/* ACTIVITY MARKUP TOTAL */}
                  <td
                    className={td}
                  >
                    {inr(
                      activityMarkupTotal,
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      land.misc_total *
                        (pct.mk /
                          100),
                    )}
                  </td>
                </tr>

                <tr className="text-muted-foreground">
                  <td
                    className="p-1.5 text-[10px] uppercase"
                    colSpan={4}
                  >
                    GST {pct.gst}% (on Base+Markup)
                  </td>

                  {renderVehicleCells(vehicleGst)}

                  <td
                    className={td}
                  >
                    {inr(
                      (
                        land.guide_total *
                        (1 +
                          pct.mk /
                            100)
                      ) *
                        (pct.gst /
                          100),
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      (
                        land.entrances_total *
                        (1 +
                          pct.mk /
                            100)
                      ) *
                        (pct.gst /
                          100),
                    )}
                  </td>

                  {/* ACTIVITY GST TOTAL */}
                  <td
                    className={td}
                  >
                    {inr(
                      activityGstTotal,
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      (
                        land.misc_total *
                        (1 +
                          pct.mk /
                            100)
                      ) *
                        (pct.gst /
                          100),
                    )}
                  </td>
                </tr>

                <tr className="bg-primary/10 font-bold">
                  <td
                    className="p-1.5 text-[10px] uppercase"
                    colSpan={4}
                  >
                    Per Person ({pax} Pax)
                  </td>

                  {renderVehicleCells(vehiclePerPerson)}

                  <td
                    className={td}
                  >
                    {inr(
                      (
                        land.guide_total *
                        (1 +
                          pct.mk /
                            100) *
                        (1 +
                          pct.gst /
                            100)
                      ) / pax,
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      (
                        land.entrances_total *
                        (1 +
                          pct.mk /
                            100) *
                        (1 +
                          pct.gst /
                            100)
                      ) / pax,
                    )}
                  </td>

                  {/* FINAL ACTIVITY PER PERSON */}
                  <td
                    className={`${td} font-bold`}
                  >
                    {inr(
                      activityPerPerson,
                    )}
                  </td>

                  <td
                    className={td}
                  >
                    {inr(
                      (
                        land.misc_total *
                        (1 +
                          pct.mk /
                            100) *
                        (1 +
                          pct.gst /
                            100)
                      ) / pax,
                    )}
                  </td>
                </tr>
              </>
            );
          })()}
        </tfoot>
      </table>
    </Card>
  );
}

function HotelMealBlock({
  sheet,
  pax,
  pct,
}: {
  sheet: HotelMealSheet;
  pax: number;
  pct: {
    mk: number;
    gst: number;
  };
}) {
  const n = Math.max(
    1,
    sheet.nights,
  );

  const computedRows =
    sheet.rows.map((r) => {
      const dyn = r.dynamic
        ? mixTotals(r)
        : null;

      const z = (
        v: number,
      ) =>
        dyn ? 0 : v;

      const sglNet =
        z(r.sgl || 0);
      const sglGst =
        sglNet *
        gstRateFor(sglNet);
      const sglTotal =
        sglNet + sglGst;

      const dblNet =
        z(r.dbl || 0);
      const dblGst =
        dblNet *
        gstRateFor(dblNet);
      const dblTotal =
        dblNet + dblGst;

      const trpNet =
        z(r.trp || 0);
      const trpGst =
        trpNet *
        gstRateFor(trpNet);
      const trpTotal =
        trpNet + trpGst;

      const quadNet =
        z(r.quad || 0);
      const quadGst =
        quadNet *
        gstRateFor(quadNet);
      const quadTotal =
        quadNet + quadGst;

      const lunchNet =
        r.lunch_total || 0;
      const lunchGst =
        lunchNet *
        gstRateFor(lunchNet);
      const lunchTotal =
        lunchNet + lunchGst;

      const dinnerNet =
        r.dinner_total || 0;
      const dinnerGst =
        dinnerNet *
        gstRateFor(dinnerNet);
      const dinnerTotal =
        dinnerNet + dinnerGst;

      return {
        ...r,
        dyn,
        sglNet,
        sglGst,
        sglTotal,
        dblNet,
        dblGst,
        dblTotal,
        trpNet,
        trpGst,
        trpTotal,
        quadNet,
        quadGst,
        quadTotal,
        lunchNet,
        lunchGst,
        lunchTotal,
        dinnerNet,
        dinnerGst,
        dinnerTotal,
      };
    });

  const totals =
    computedRows.reduce(
      (acc, r) => ({
        sglNet:
          acc.sglNet +
          r.sglNet,
        sglGst:
          acc.sglGst +
          r.sglGst,
        sglTotal:
          acc.sglTotal +
          r.sglTotal,

        dblNet:
          acc.dblNet +
          r.dblNet,
        dblGst:
          acc.dblGst +
          r.dblGst,
        dblTotal:
          acc.dblTotal +
          r.dblTotal,

        trpNet:
          acc.trpNet +
          r.trpNet,
        trpGst:
          acc.trpGst +
          r.trpGst,
        trpTotal:
          acc.trpTotal +
          r.trpTotal,

        quadNet:
          acc.quadNet +
          r.quadNet,
        quadGst:
          acc.quadGst +
          r.quadGst,
        quadTotal:
          acc.quadTotal +
          r.quadTotal,

        lunchNet:
          acc.lunchNet +
          r.lunchNet,
        lunchGst:
          acc.lunchGst +
          r.lunchGst,
        lunchTotal:
          acc.lunchTotal +
          r.lunchTotal,

        dinnerNet:
          acc.dinnerNet +
          r.dinnerNet,
        dinnerGst:
          acc.dinnerGst +
          r.dinnerGst,
        dinnerTotal:
          acc.dinnerTotal +
          r.dinnerTotal,

        dynNet:
          acc.dynNet +
          (r.dyn?.net ?? 0),

        dynTotal:
          acc.dynTotal +
          (r.dyn?.total ?? 0),
      }),
      {
        sglNet: 0,
        sglGst: 0,
        sglTotal: 0,
        dblNet: 0,
        dblGst: 0,
        dblTotal: 0,
        trpNet: 0,
        trpGst: 0,
        trpTotal: 0,
        quadNet: 0,
        quadGst: 0,
        quadTotal: 0,
        lunchNet: 0,
        lunchGst: 0,
        lunchTotal: 0,
        dinnerNet: 0,
        dinnerGst: 0,
        dinnerTotal: 0,
        dynNet: 0,
        dynTotal: 0,
      },
    );

  const dynamicNights =
    computedRows.filter(
      (r) => r.dyn,
    ).length;

  const allDynamic =
    computedRows.length > 0 &&
    dynamicNights ===
      computedRows.length;

  const showQuad =
    computedRows.some(
      (r) =>
        !r.dyn &&
        (r.quad || 0) > 0,
    );

  const rateCols =
    showQuad ? 4 : 3;

  return (
    <Card className="p-3 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="section-label">
          Hotels &amp; Meals
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="text-[10px]"
          >
            {sheet.category} ·{" "}
            {sheet.nights} night(s)
          </Badge>

          <Badge
            variant="secondary"
            className="text-[10px]"
          >
            Markup {pct.mk}% · GST{" "}
            {pct.gst}% applied
          </Badge>
        </div>
      </div>

      <table className="text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className={thL}>
              Night
            </th>

            <th className={thL}>
              Hotel / Room
            </th>

            <th className={thL}>
              Plan
            </th>

            {allDynamic ? (
              <th
                className={thL}
                colSpan={rateCols}
              >
                Accommodation
              </th>
            ) : (
              <>
                <th className={th}>
                  SGL
                </th>
                <th className={th}>
                  DBL
                </th>
                <th className={th}>
                  TRP
                </th>
                {showQuad && (
                  <th className={th}>
                    QUAD
                  </th>
                )}
              </>
            )}

            <th className={thL}>
              Lunch
            </th>

            <th className={th}>
              Amt
            </th>

            <th className={thL}>
              Dinner
            </th>

            <th className={th}>
              Amt
            </th>
          </tr>
        </thead>

        <tbody>
          {computedRows.map(
            (r) => (
              <tr
                key={r.day}
                className="border-t"
              >
                <td className="p-1.5 whitespace-nowrap">
                  <div>
                    Day {r.day}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.city}
                  </div>
                </td>

                <td className="p-1.5">
                  <div>
                    {r.hotel}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.room}
                  </div>
                </td>

                <td className="p-1.5">
                  {r.meal_plan}
                </td>

                {r.dyn ? (
                  <td
                    className="p-1.5"
                    colSpan={
                      rateCols
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">
                        {r.mix_label ||
                          "No rooms"}
                      </span>

                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">
                          {inr(
                            r.dyn.total,
                          )}
                        </span>

                        <span className="block text-[11px] text-muted-foreground tabular-nums">
                          Net:{" "}
                          {inr(
                            r.dyn.net,
                          )}{" "}
                          + GST{" "}
                          {inr(
                            r.dyn.gst,
                          )}{" "}
                          ·{" "}
                          {inr(
                            r.dyn
                              .total /
                              pax,
                          )}
                          /person
                        </span>
                      </span>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className={td}>
                      <div className="text-[#0F172A] font-semibold">
                        {r.sglTotal
                          ? inr(
                              r.sglTotal,
                            )
                          : "—"}
                      </div>

                      {r.sglTotal >
                        0 && (
                        <div className="text-[11px] text-[#64748B] font-normal">
                          Net:{" "}
                          {inr(
                            r.sglNet,
                          )}{" "}
                          + GST{" "}
                          {(
                            gstRateFor(
                              r.sglNet,
                            ) *
                            100
                          ).toFixed(
                            0,
                          )}
                          %
                        </div>
                      )}
                    </td>

                    <td className={td}>
                      <div className="text-[#0F172A] font-semibold">
                        {r.dblTotal
                          ? inr(
                              r.dblTotal,
                            )
                          : "—"}
                      </div>

                      {r.dblTotal >
                        0 && (
                        <div className="text-[11px] text-[#64748B] font-normal">
                          Net:{" "}
                          {inr(
                            r.dblNet,
                          )}{" "}
                          + GST{" "}
                          {(
                            gstRateFor(
                              r.dblNet,
                            ) *
                            100
                          ).toFixed(
                            0,
                          )}
                          %
                        </div>
                      )}
                    </td>

                    <td className={td}>
                      <div className="text-[#0F172A] font-semibold">
                        {r.trpTotal
                          ? inr(
                              r.trpTotal,
                            )
                          : "—"}
                      </div>

                      {r.trpTotal >
                        0 && (
                        <div className="text-[11px] text-[#64748B] font-normal">
                          Net:{" "}
                          {inr(
                            r.trpNet,
                          )}{" "}
                          + GST{" "}
                          {(
                            gstRateFor(
                              r.trpNet,
                            ) *
                            100
                          ).toFixed(
                            0,
                          )}
                          %
                        </div>
                      )}
                    </td>

                    {showQuad && (
                      <td className={td}>
                        <div className="text-[#0F172A] font-semibold">
                          {r.quadTotal
                            ? inr(
                                r.quadTotal,
                              )
                            : "—"}
                        </div>

                        {r.quadTotal >
                          0 && (
                          <div className="text-[11px] text-[#64748B] font-normal">
                            Net:{" "}
                            {inr(
                              r.quadNet,
                            )}{" "}
                            + GST{" "}
                            {(
                              gstRateFor(
                                r.quadNet,
                              ) *
                              100
                            ).toFixed(
                              0,
                            )}
                            %
                          </div>
                        )}
                      </td>
                    )}
                  </>
                )}

                <td className="p-1.5">
                  {r.lunch_source}
                </td>

                <td className={td}>
                  <div className="text-[#0F172A] font-semibold">
                    {r.lunchTotal
                      ? inr(
                          r.lunchTotal,
                        )
                      : "—"}
                  </div>

                  {r.lunchTotal >
                    0 && (
                    <div className="text-[11px] text-[#64748B] font-normal">
                      Net:{" "}
                      {inr(
                        r.lunchNet,
                      )}{" "}
                      + GST{" "}
                      {(
                        gstRateFor(
                          r.lunchNet,
                        ) * 100
                      ).toFixed(0)}
                      %
                    </div>
                  )}
                </td>

                <td className="p-1.5">
                  {r.dinner_source}
                </td>

                <td className={td}>
                  <div className="text-[#0F172A] font-semibold">
                    {r.dinnerTotal
                      ? inr(
                          r.dinnerTotal,
                        )
                      : "—"}
                  </div>

                  {r.dinnerTotal >
                    0 && (
                    <div className="text-[11px] text-[#64748B] font-normal">
                      Net:{" "}
                      {inr(
                        r.dinnerNet,
                      )}{" "}
                      + GST{" "}
                      {(
                        gstRateFor(
                          r.dinnerNet,
                        ) * 100
                      ).toFixed(0)}
                      %
                    </div>
                  )}
                </td>
              </tr>
            ),
          )}

          {sheet.rows.length ===
            0 && (
            <tr>
              <td
                colSpan={11}
                className="p-3 text-center text-muted-foreground"
              >
                No overnight
                stays selected.
              </td>
            </tr>
          )}
        </tbody>

        <tfoot>
          <tr className="border-t-2 bg-muted/30 font-medium">
            <td
              className="p-1.5"
              colSpan={3}
            >
              Subtotal (Per Night)
            </td>

            {allDynamic ? (
              <td
                className={td}
                colSpan={rateCols}
              >
                {inr(
                  totals.dynNet /
                    n,
                )}
              </td>
            ) : (
              <>
                <td className={td}>
                  {inr(
                    totals.sglNet /
                      n,
                  )}
                </td>

                <td className={td}>
                  {inr(
                    totals.dblNet /
                      n,
                  )}
                </td>

                <td className={td}>
                  {inr(
                    totals.trpNet /
                      n,
                  )}
                </td>

                {showQuad && (
                  <td
                    className={td}
                  >
                    {inr(
                      totals.quadNet /
                        n,
                    )}
                  </td>
                )}
              </>
            )}

            <td className="p-1.5" />

            <td className={td}>
              {inr(
                totals.lunchNet /
                  n,
              )}
            </td>

            <td className="p-1.5" />

            <td className={td}>
              {inr(
                totals.dinnerNet /
                  n,
              )}
            </td>
          </tr>

          <tr className="bg-primary/10 font-bold">
            <td
              className="p-1.5"
              colSpan={3}
            >
              Total ({sheet.nights} Nights)
            </td>

            {allDynamic ? (
              <td
                className={td}
                colSpan={rateCols}
              >
                {inr(
                  totals.dynTotal,
                )}
              </td>
            ) : (
              <>
                <td className={td}>
                  {inr(
                    totals.sglTotal,
                  )}
                </td>

                <td className={td}>
                  {inr(
                    totals.dblTotal,
                  )}
                </td>

                <td className={td}>
                  {inr(
                    totals.trpTotal,
                  )}
                </td>

                {showQuad && (
                  <td
                    className={td}
                  >
                    {inr(
                      totals.quadTotal,
                    )}
                  </td>
                )}
              </>
            )}

            <td className="p-1.5" />

            <td className={td}>
              {inr(
                totals.lunchTotal,
              )}
            </td>

            <td className="p-1.5" />

            <td className={td}>
              {inr(
                totals.dinnerTotal,
              )}
            </td>
          </tr>

          {dynamicNights >
            0 && (
            <tr className="bg-accent/10 font-semibold">
              <td
                className="p-1.5"
                colSpan={3}
              >
                Dynamic rooms (
                {dynamicNights}{" "}
                night(s))
              </td>

              <td
                className="p-1.5"
                colSpan={rateCols}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase text-muted-foreground">
                    Allocated mix
                  </span>

                  <span className="text-right">
                    <span className="block tabular-nums">
                      {inr(
                        totals.dynTotal,
                      )}
                    </span>

                    <span className="block text-[11px] font-normal text-muted-foreground tabular-nums">
                      {inr(
                        totals.dynTotal /
                          pax,
                      )}
                      /person (
                      {pax} pax)
                    </span>
                  </span>
                </div>
              </td>

              <td
                className="p-1.5"
                colSpan={4}
              />
            </tr>
          )}

          <HotelMarkupRows
            totals={totals}
            pct={pct}
            pax={pax}
            showQuad={showQuad}
          />
        </tfoot>
      </table>
    </Card>
  );
}

function HotelMarkupRows({
  totals,
  pct,
  pax,
  showQuad,
}: {
  totals: {
    sglTotal: number;
    dblTotal: number;
    trpTotal: number;
    quadTotal: number;
    lunchTotal: number;
    dinnerTotal: number;
  };
  pct: {
    mk: number;
    gst: number;
  };
  pax: number;
  showQuad: boolean;
}) {
  const cells = showQuad
    ? [
        totals.sglTotal,
        totals.dblTotal,
        totals.trpTotal,
        totals.quadTotal,
      ]
    : [
        totals.sglTotal,
        totals.dblTotal,
        totals.trpTotal,
      ];

  const shares = [
    1,
    2,
    3,
    4,
  ];

  const rows: [
    string,
    (v: number) => number
  ][] = [
    [
      `Markup ${pct.mk}%`,
      (v) =>
        v *
        (pct.mk / 100),
    ],

    [
      `GST ${pct.gst}% (on Base+Markup)`,
      (v) =>
        (
          v +
          v *
            (pct.mk /
              100)
        ) *
        (pct.gst /
          100),
    ],

    [
      "Per person (share)",
      (v) =>
        v *
        (1 +
          pct.mk / 100) *
        (1 +
          pct.gst / 100),
    ],
  ];

  return (
    <>
      {rows.map(
        ([name, fn], i) => (
          <tr
            key={name}
            className={
              i === 2
                ? "bg-primary/10 font-semibold"
                : "text-muted-foreground"
            }
          >
            <td
              className="p-1.5 text-[10px] uppercase"
              colSpan={3}
            >
              {i === 0
                ? "Hotels & Meals · "
                : ""}
              {name}
            </td>

            {cells.map(
              (v, j) => (
                <td
                  key={j}
                  className={td}
                >
                  {inr(
                    i === 2
                      ? fn(v) /
                        shares[j]
                      : fn(v),
                  )}
                </td>
              ),
            )}

            <td className="p-1.5" />

            <td className={td}>
              {inr(
                fn(
                  totals.lunchTotal,
                ),
              )}
            </td>

            <td className="p-1.5" />

            <td className={td}>
              {inr(
                fn(
                  totals.dinnerTotal,
                ),
              )}
            </td>
          </tr>
        ),
      )}
    </>
  );
}

/**
 * Detailed Rate Sheet for one scenario
 * (hotel option + optional single vehicle).
 */
export function ScenarioRateSheet({
  draft,
  optionKey,
  transportLineId,
}: {
  draft: QuoteDraft;
  optionKey: string;
  transportLineId?: string;
}) {
  const d = useDB();

  const opt =
    (draft.hotel_options ??
      []).find(
        (o) =>
          o.key ===
          optionKey,
      );

  const transport =
    transportLineId
      ? (draft.transport ??
          []).filter(
            (t) =>
              t.id ===
              transportLineId,
          )
      : draft.transport ??
        [];

  const land = useMemo<LandPartSheet>(
    () =>
      normalizeActivityPricing(
        buildLandPart(
          draft,
          d,
        ),
        d,
        Math.max(
          1,
          effectivePaxForPricing(
            draft,
          ),
        ),
      ),
    [draft, d],
  );

  const groups =
    useMemo<RateSheetGroup[]>(
      () =>
        opt
          ? buildRateSheet(
              draft,
              d,
              opt,
              transport,
            )
          : [],
      [
        draft,
        d,
        opt,
        transportLineId,
      ],
    );

  if (!opt) return null;

  const pax = Math.max(
    1,
    effectivePaxForPricing(
      draft,
    ),
  );

  return (
    <RateSheetBlock
      groups={groups}
      land={land}
      pax={pax}
      landPct={{
        mk:
          landMarkup(draft) *
          100,
        gst:
          landGst(draft) *
          100,
      }}
      hotelPct={{
        mk:
          hotelsMarkup(
            draft,
          ) * 100,
        gst:
          hotelsGst(
            draft,
          ) * 100,
      }}
      db={d}
    />
  );
}

export function FinalRateSheet({
  draft,
}: {
  draft: QuoteDraft;
}) {
  const d = useDB();

  const pax = Math.max(
    1,
    effectivePaxForPricing(
      draft,
    ),
  );

  const land = useMemo<LandPartSheet>(
    () =>
      normalizeActivityPricing(
        buildLandPart(
          draft,
          d,
        ),
        d,
        pax,
      ),
    [draft, d, pax],
  );

  const includedKeys =
    draft.included_option_keys
      ?.length
      ? draft.included_option_keys
      : (
          draft.hotel_options ??
          []
        ).map(
          (o) => o.key,
        );

  const options =
    (
      draft.hotel_options ??
      []
    ).filter((o) =>
      includedKeys.includes(
        o.key,
      ),
    );

  if (!options.length)
    return null;

  return (
    <>
      {options.map((o) => (
        <FinalRateSheetOption
          key={o.key}
          draft={draft}
          opt={o}
          land={land}
          pax={pax}
          d={d}
        />
      ))}
    </>
  );
}

function FinalRateSheetOption({
  draft,
  opt,
  land,
  pax,
  d,
}: {
  draft: QuoteDraft;
  opt: HotelOption;
  land: LandPartSheet;
  pax: number;
  d: ReturnType<
    typeof useDB
  >;
}) {
  const groups =
    useMemo<RateSheetGroup[]>(
      () =>
        buildRateSheet(
          draft,
          d,
          opt,
          draft.transport ??
            [],
        ),
      [draft, d, opt],
    );

  return (
    <RateSheetBlock
      groups={groups}
      land={land}
      pax={pax}
      landPct={{
        mk:
          landMarkup(draft) *
          100,
        gst:
          landGst(draft) *
          100,
      }}
      hotelPct={{
        mk:
          hotelsMarkup(
            draft,
          ) * 100,
        gst:
          hotelsGst(
            draft,
          ) * 100,
      }}
      db={d}
      draft={draft}
      optionKey={opt.key}
      selectedOnly
      title={`Selected Rate Sheet Rows — ${
        opt.category ||
        opt.label ||
        `Option ${opt.key}`
      }`}
    />
  );
}

export const rateRowKey = (
  optionKey: string,
  g: RateSheetGroup,
) =>
  `${optionKey}|${
    g.line_id ??
    g.vehicle
  }`;

function RateSheetBlock({
  groups,
  land,
  pax,
  landPct,
  hotelPct,
  db,
  draft,
  set,
  optionKey,
  selectedOnly,
  title,
}: {
  groups: RateSheetGroup[];
  land: LandPartSheet;
  pax: number;
  landPct: {
    mk: number;
    gst: number;
  };
  hotelPct: {
    mk: number;
    gst: number;
  };
  db: ReturnType<
    typeof useDB
  >;
  draft?: QuoteDraft;
  set?: SetDraft;
  optionKey?: string;
  selectedOnly?: boolean;
  title?: string;
}) {
  const selectable = !!(
    set &&
    draft &&
    optionKey
  );

  const showPick =
    selectable &&
    !selectedOnly;

  const picksFor = (
    g: RateSheetGroup,
  ): number[] | null => {
    if (
      !optionKey ||
      !draft
    )
      return null;

    return (
      draft.rate_sheet_rows?.[
        rateRowKey(
          optionKey,
          g,
        )
      ] ?? null
    );
  };

  const writePicks = (
    g: RateSheetGroup,
    rows: number[],
  ) => {
    if (
      !set ||
      !draft ||
      !optionKey
    )
      return;

    set({
      rate_sheet_rows: {
        ...(draft.rate_sheet_rows ??
          {}),
        [rateRowKey(
          optionKey,
          g,
        )]: rows,
      },
    });
  };

  const toggleRow = (
    g: RateSheetGroup,
    paxRow: number,
  ) => {
    const current =
      picksFor(g) ?? [];

    writePicks(
      g,
      current.includes(
        paxRow,
      )
        ? current.filter(
            (x) =>
              x !== paxRow,
          )
        : [
            ...current,
            paxRow,
          ].sort(
            (a, b) =>
              a - b,
          ),
    );
  };

  const toggleGroup = (
    g: RateSheetGroup,
  ) => {
    const current =
      picksFor(g) ?? [];

    const all =
      g.rows.map(
        (r) => r.pax,
      );

    writePicks(
      g,
      current.length ===
        all.length
        ? []
        : all,
    );
  };

  const landPerPerson = {
    entrances:
      applyMarkupAndGst(
        land.entrances_total,
        landPct.mk,
        landPct.gst,
        pax,
      ).per_person,

    /*
     * Activity is calculated dynamically
     * for each pax row below.
     */
    activities:
      applyActivityMarkupAndGst(
        land.activities_total,
        landPct.mk,
        landPct.gst,
        pax,
      ).finalPerPerson,

    misc:
      applyMarkupAndGst(
        land.misc_total,
        landPct.mk,
        landPct.gst,
        pax,
      ).per_person,
  };

  const visibleGroups =
    selectedOnly
      ? groups
          .map((g) => ({
            ...g,
            rows: g.rows.filter(
              (r) =>
                (
                  picksFor(g) ??
                  []
                ).includes(
                  r.pax,
                ),
            ),
          }))
          .filter(
            (g) =>
              g.rows.length >
              0,
          )
      : groups;

  if (
    selectedOnly &&
    visibleGroups.length === 0
  ) {
    return null;
  }

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="section-label">
            {title ??
              "Rate Sheet (Per Pax / Person)"}
          </div>

          <div className="text-xs text-muted-foreground">
            Land Part +
            Accommodation Part
            {showPick &&
              " · tick the pax rows that should carry forward to Final Costing"}
          </div>
        </div>

        <div className="flex gap-2">
          <Badge
            variant="secondary"
            className="text-[10px]"
          >
            Land: Markup{" "}
            {landPct.mk}% · GST{" "}
            {landPct.gst}%
          </Badge>

          <Badge
            variant="secondary"
            className="text-[10px]"
          >
            Hotels &amp; Meals:
            Markup{" "}
            {hotelPct.mk}% · GST{" "}
            {hotelPct.gst}%
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr className="bg-muted/60">
              <th
                className={thL}
                colSpan={
                  showPick
                    ? 9
                    : 8
                }
              >
                Land Part
              </th>

              <th
                className={th}
                colSpan={6}
              >
                Accommodation
                Part
              </th>

              <th
                className={th}
                colSpan={5}
              >
                Package Cost
                (Per Person)
              </th>
            </tr>

            <tr className="bg-muted/40">
              {showPick && (
                <th
                  className={thL}
                >
                  Use
                </th>
              )}

              <th className={thL}>
                Pax
              </th>

              <th className={thL}>
                Vehicle
              </th>

              <th className={th}>
                Transport
              </th>

              <th className={th}>
                Guide
              </th>

              <th className={th}>
                Escort
              </th>

              <th className={th}>
                Entrances
              </th>

              <th className={th}>
                Activities
              </th>

              <th className={th}>
                Misc
              </th>

              <th className={th}>
                Single
              </th>

              <th className={th}>
                Double
              </th>

              <th className={th}>
                Triple
              </th>

              <th className={th}>
                Quad
              </th>

              <th className={th}>
                Lunch
              </th>

              <th className={th}>
                Dinner
              </th>

              <th className={th}>
                Pax
              </th>

              <th className={th}>
                Single Occ.
              </th>

              <th className={th}>
                Double Sharing
              </th>

              <th className={th}>
                Triple Sharing
              </th>

              <th className={th}>
                Quad Sharing
              </th>
            </tr>
          </thead>

          <tbody>
            {visibleGroups.map(
              (g) => (
                <FragmentGroup
                  key={
                    g.line_id ??
                    g.vehicle
                  }
                  group={g}
                  land={land}
                  db={db}
                  landPerPerson={
                    landPerPerson
                  }
                  landPct={
                    landPct
                  }
                  showPick={
                    showPick
                  }
                  picked={
                    picksFor(g) ??
                    []
                  }
                  onToggleRow={(
                    p,
                  ) =>
                    toggleRow(
                      g,
                      p,
                    )
                  }
                  onToggleGroup={() =>
                    toggleGroup(
                      g,
                    )
                  }
                />
              ),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * ACTIVITY RATE SHEET
 *
 * For each exact pax row:
 *
 * Activity Total
 * ÷ Pax
 * = rounded Activity Per Person
 *
 * Then:
 * + Markup
 * + GST
 *
 * Example for 7 pax:
 * ₹15,800 / 7 = ₹2,257
 * Markup 10% = ₹225
 * GST 5% = ₹124
 * Final = ₹2,606
 */
function getActivitiesPerPersonForPax(
  land: LandPartSheet,
  db: ReturnType<
    typeof useDB
  >,
  pax: number,
  landPct: {
    mk: number;
    gst: number;
  },
): number {
  const safePax =
    Math.max(
      1,
      Math.round(pax),
    );

  const total =
    land.rows.reduce(
      (sum, row) => {
        const destination =
          db.destination_cities.find(
            (city) =>
              city.name
                .trim()
                .toLowerCase() ===
              row.city
                .trim()
                .toLowerCase(),
          );

        const rowTotal =
          row.activity_opts.reduce(
            (
              rowSum,
              option,
            ) => {
              if (
                !option.checked
              ) {
                return rowSum;
              }

              const activity =
                db.activities.find(
                  (a) => {
                    const sameName =
                      a.activity_name
                        .trim()
                        .toLowerCase() ===
                      option.label
                        .trim()
                        .toLowerCase();

                    const sameDestination =
                      destination
                        ? a.destination_id ===
                          destination.id
                        : true;

                    return (
                      sameName &&
                      sameDestination
                    );
                  },
                );

              /*
               * IMPORTANT:
               *
               * Activity amount is already
               * a GROUP TOTAL.
               *
               * Do NOT multiply by pax.
               */
              if (
                activity?.pricing_slabs
                  ?.length
              ) {
                const slab =
                  pickActivitySlab(
                    activity.pricing_slabs,
                    safePax,
                  );

                return (
                  rowSum +
                  slab.price
                );
              }

              return (
                rowSum +
                (activity?.price ??
                  option.amount)
              );
            },
            0,
          );

        return (
          sum +
          rowTotal
        );
      },
      0,
    );

  const activityCalc =
    applyActivityMarkupAndGst(
      total,
      landPct.mk,
      landPct.gst,
      safePax,
    );

  return (
    activityCalc.finalPerPerson
  );
}

function FragmentGroup({
  group: g,
  land,
  db,
  landPerPerson,
  landPct,
  showPick,
  picked = [],
  onToggleRow,
  onToggleGroup,
}: {
  group: RateSheetGroup;
  land: LandPartSheet;
  db: ReturnType<
    typeof useDB
  >;
  landPerPerson: {
    entrances: number;
    activities: number;
    misc: number;
  };
  landPct: {
    mk: number;
    gst: number;
  };
  showPick?: boolean;
  picked?: number[];
  onToggleRow?: (
    p: number,
  ) => void;
  onToggleGroup?: () => void;
}) {
  const allPicked =
    g.rows.length > 0 &&
    picked.length ===
      g.rows.length;

  return (
    <>
      <tr className="border-t bg-primary/5">
        <td
          className="p-1.5 font-semibold"
          colSpan={
            showPick
              ? 20
              : 19
          }
        >
          <div className="flex items-center gap-2">
            {showPick && (
              <label className="flex items-center gap-1 text-[10px] font-normal cursor-pointer">
                <Checkbox
                  checked={
                    allPicked
                  }
                  onCheckedChange={() =>
                    onToggleGroup?.()
                  }
                />
                Select all
              </label>
            )}

            <span>
              {g.vehicle}
            </span>
          </div>
        </td>
      </tr>

      {g.rows.map((r) => {
        /*
         * ACTIVITY:
         *
         * Calculate using the exact pax of this
         * Rate Sheet row.
         */
        const activitiesPerPerson =
          getActivitiesPerPersonForPax(
            land,
            db,
            r.pax,
            landPct,
          );

        const commonLandPerPerson =
          r.transport +
          r.guide +
          r.escort +
          landPerPerson.entrances +
          activitiesPerPerson +
          landPerPerson.misc;

        const packageSingle =
          commonLandPerPerson +
          r.single;

        const packageDouble =
          commonLandPerPerson +
          r.double;

        const packageTriple =
          commonLandPerPerson +
          r.triple;

        const packageQuad =
          commonLandPerPerson +
          r.quad;

        const rowPicked =
          picked.includes(
            r.pax,
          );

        return (
          <tr
            key={`${g.vehicle}-${r.pax}`}
            className={`border-t ${
              showPick &&
              !rowPicked
                ? "opacity-60"
                : ""
            }`}
          >
            {showPick && (
              <td className="p-1.5">
                <Checkbox
                  checked={
                    rowPicked
                  }
                  onCheckedChange={() =>
                    onToggleRow?.(
                      r.pax,
                    )
                  }
                />
              </td>
            )}

            <td className="p-1.5">
              {r.pax}
            </td>

            <td className="p-1.5">
              {r.vehicle}
            </td>

            <td className={td}>
              {inr(
                r.transport,
              )}
            </td>

            <td className={td}>
              {inr(
                r.guide,
              )}
            </td>

            <td className={td}>
              {inr(
                r.escort,
              )}
            </td>

            <td className={td}>
              {inr(
                landPerPerson.entrances,
              )}
            </td>

            {/* ACTIVITY FINAL PER PERSON */}
            <td
              className={`${td} font-semibold`}
            >
              {inr(
                activitiesPerPerson,
              )}
            </td>

            <td className={td}>
              {inr(
                landPerPerson.misc,
              )}
            </td>

            <td className={td}>
              {inr(
                r.single,
              )}
            </td>

            <td className={td}>
              {inr(
                r.double,
              )}
            </td>

            <td className={td}>
              {inr(
                r.triple,
              )}
            </td>

            <td className={td}>
              {inr(
                r.quad,
              )}
            </td>

            <td className={td}>
              {inr(
                r.lunch,
              )}
            </td>

            <td className={td}>
              {inr(
                r.dinner,
              )}
            </td>

            <td className={td}>
              {r.pax}
            </td>

            <td
              className={`${td} font-semibold`}
            >
              {inr(
                packageSingle,
              )}
            </td>

            <td
              className={`${td} font-semibold`}
            >
              {inr(
                packageDouble,
              )}
            </td>

            <td
              className={`${td} font-semibold`}
            >
              {inr(
                packageTriple,
              )}
            </td>

            <td
              className={`${td} font-semibold`}
            >
              {inr(
                packageQuad,
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
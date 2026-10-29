import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { addDaysISO, fmtDateShort, inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import {
  computeMealDays,
  dynamicAccommodationBreakdown,
  dynamicAccommodationRoomLines,
  effectiveAccommodationPax,
  getCostingPaxValues,
  hotelsGst,
  hotelsMarkup,
  mealPlanCoverage,
} from "@/lib/wizard/calc";
import {
  hotelSelectionForDay,
  type HotelOption,
  type OptionKey,
  type QuoteDraft,
} from "@/lib/wizard/types";

const gridTable =
  "w-full border-separate border-spacing-0 text-[10px] [&_td]:border-b [&_td]:border-r [&_td]:border-[#cfdeea] [&_td]:px-1.5 [&_td]:py-1 [&_th]:border-b [&_th]:border-r [&_th]:border-[#cfdeea] [&_th]:px-1.5 [&_th]:py-1";
const optionTints = ["bg-[#eaf3fb]", "bg-[#edf7ef]", "bg-[#fff8df]", "bg-[#f5effb]"];

type MealKind = "Lunch" | "Dinner";
type MealSummary = { base: number; markup: number; gst: number; final: number };
type OptionData = {
  option: HotelOption;
  pax: number;
  roomLines: ReturnType<typeof dynamicAccommodationRoomLines>["lines"];
  missingRates: number;
  allocationIssueDays: number[];
  accommodation: ReturnType<typeof dynamicAccommodationBreakdown>;
  mealRows: ReturnType<typeof computeMealDays>["rows"];
};

const occupancyLabel = (value: string): string => value[0].toUpperCase() + value.slice(1);

export function toggleDynamicReviewOption(
  visibleKeys: readonly OptionKey[],
  optionKey: OptionKey,
  checked: boolean,
): OptionKey[] {
  if (checked)
    return visibleKeys.includes(optionKey) ? [...visibleKeys] : [...visibleKeys, optionKey];
  return visibleKeys.filter((key) => key !== optionKey);
}

function displayCity(
  value: string | undefined,
  cities: ReturnType<typeof useDB>["cities"],
): string {
  if (!value) return "";
  return cities.find((city) => city.id === value)?.name || value;
}

function routingSummary(draft: QuoteDraft, cities: ReturnType<typeof useDB>["cities"]): string {
  const parts: string[] = [];
  draft.routing
    .filter((day) => !(day.is_day_zero || day.day === 0))
    .forEach((day) => {
      const from = displayCity(day.from_city, cities);
      if (from && parts[parts.length - 1] !== from) parts.push(from);
      const destinations = day.to_city_ids?.length
        ? day.to_city_ids.map((id) => displayCity(id, cities))
        : day.to_city_id
          ? [displayCity(day.to_city_id, cities)]
          : day.to_city
            ? [displayCity(day.to_city, cities)]
            : [];
      destinations.forEach((city) => {
        if (city && parts[parts.length - 1] !== city) parts.push(city);
      });
      const overnight = displayCity(day.city_id, cities);
      if (day.overnight && overnight && parts[parts.length - 1] !== overnight)
        parts.push(overnight);
    });
  return parts.join(" → ") || "—";
}

function TripInformation({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const client =
    draft.query_type === "B2C"
      ? draft.guest.name || "—"
      : draft.query_type === "Brochure"
        ? draft.brochure.theme || "—"
        : draft.agent.agency || draft.agent.name || "—";
  const reference = draft.linked_query_id || draft.linked_query_name || "Draft quotation";
  const travelDates = draft.start_date
    ? `${fmtDateShort(draft.start_date)} → ${fmtDateShort(addDaysISO(draft.start_date, draft.nights))}`
    : "—";
  const pax = getCostingPaxValues(draft);
  const nationality = draft.entrance_traveller_category ?? draft.traveler_type ?? "—";

  const facts = [
    [draft.query_type === "B2B" ? "Travel Partner / Client" : "Client", client],
    ["Quotation / Query No.", reference],
    ["Programme", draft.program_name || "—"],
    ["Travel Dates", travelDates],
    ["Duration", `${draft.nights} Nights / ${draft.nights + 1} Days`],
    ["Travellers", `${pax.join(", ") || "—"} · ${draft.tour_type || "—"}`],
  ];

  return (
    <section className="overflow-hidden border border-[#cfdeea] bg-white">
      <div className="bg-[#103a5c] px-3 py-1.5 text-xs font-semibold text-white">
        1. Trip Information
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[10px]">
          <tbody>
            <tr>
              {facts.map(([label, value]) => (
                <td
                  key={label}
                  className="border-b border-r border-[#cfdeea] px-2 py-1.5 align-top"
                >
                  <div className="text-[8px] font-semibold uppercase tracking-wide text-[#6e8195]">
                    {label}
                  </div>
                  <div className="mt-0.5 font-semibold text-[#16344f]">{value}</div>
                </td>
              ))}
            </tr>
            <tr>
              <td colSpan={facts.length} className="bg-[#f5f8fb] px-2 py-1.5 text-[#16344f]">
                <b>Routing:</b> {routingSummary(draft, db.cities)}
                <span className="mx-2 text-[#6e8195]">·</span>
                <b>Tour type:</b> {draft.tour_type || "—"}
                <span className="mx-2 text-[#6e8195]">·</span>
                <b>Nationality / entrance basis:</b> {nationality}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function commercialSummary(base: number, markupRate: number, gstRate: number): MealSummary {
  const markup = base * markupRate;
  const gst = (base + markup) * gstRate;
  return { base, markup, gst, final: base + markup + gst };
}

export function AccommodationDynamicCostingReview({
  draft,
  options,
  embedded = false,
  embeddedSectionNumber = 3,
}: {
  draft: QuoteDraft;
  options: HotelOption[];
  embedded?: boolean;
  embeddedSectionNumber?: number;
}) {
  const db = useDB();
  const [visibleOptionKeys, setVisibleOptionKeys] = useState<OptionKey[]>(() =>
    options.map((option) => option.key),
  );
  const optionKeys = options.map((option) => option.key);
  const optionKeySignature = optionKeys.join("|");
  const previousOptionKeys = useRef<OptionKey[]>(optionKeys);
  const [includeLunch, setIncludeLunch] = useState(true);
  const [includeDinner, setIncludeDinner] = useState(true);

  useEffect(() => {
    const currentKeys = optionKeySignature ? (optionKeySignature.split("|") as OptionKey[]) : [];
    setVisibleOptionKeys((current) => {
      const next = current.filter((key) => currentKeys.includes(key));
      currentKeys.forEach((key) => {
        if (!previousOptionKeys.current.includes(key) && !next.includes(key)) next.push(key);
      });
      return next;
    });
    previousOptionKeys.current = currentKeys;
  }, [optionKeySignature]);

  const visibleOptions = options.filter((option) => visibleOptionKeys.includes(option.key));
  const optionData = useMemo<OptionData[]>(
    () =>
      visibleOptions.map((option) => {
        const pax = effectiveAccommodationPax(draft, option);
        const resolution = dynamicAccommodationRoomLines(draft, option, db);
        const allocationIssueDays = draft.routing
          .filter((day) => day.overnight)
          .filter((day) => {
            if (hotelSelectionForDay(option, day, true)?.no_hotel) return false;
            const validLines = resolution.lines.filter((line) => line.day === day.day);
            const capacity = validLines.reduce((sum, line) => sum + line.capacity, 0);
            const allocatedRows = option.dynamic_allocations?.[day.day] ?? [];
            return (
              capacity !== pax ||
              validLines.length !== allocatedRows.length ||
              (pax > 0 && validLines.some((line) => line.rooms <= 0))
            );
          })
          .map((day) => day.day);
        return {
          option,
          pax,
          roomLines: resolution.lines,
          missingRates: resolution.missing,
          allocationIssueDays,
          accommodation: dynamicAccommodationBreakdown(draft, option, db),
          mealRows: computeMealDays(draft, db, option.key).rows,
        };
      }),
    [visibleOptions, draft, db],
  );
  const stays = draft.routing.filter((day) => day.overnight);
  const optionPaxSummary = visibleOptions
    .map((option) => `Option ${option.key}: ${effectiveAccommodationPax(draft, option)} Pax`)
    .join(" · ");
  const markupRate = hotelsMarkup(draft);
  const gstRate = hotelsGst(draft);
  const roomingPax = optionPaxSummary || "—";

  const mealSummary = (data: OptionData, kind: MealKind): MealSummary => {
    const enabled = kind === "Lunch" ? includeLunch : includeDinner;
    const base = enabled
      ? data.mealRows
          .filter((row) => row.meal_type === kind)
          .reduce((sum, row) => sum + row.total, 0)
      : 0;
    return commercialSummary(base, markupRate, gstRate);
  };
  const summaries = optionData.map((data) => ({
    data,
    accommodation: commercialSummary(data.accommodation.total, markupRate, gstRate),
    lunch: mealSummary(data, "Lunch"),
    dinner: mealSummary(data, "Dinner"),
  }));

  const toggleOption = (key: OptionKey, checked: boolean) =>
    setVisibleOptionKeys((current) => toggleDynamicReviewOption(current, key, checked));

  return (
    <div className="space-y-2 text-[#16344f]">
      {!embedded && <TripInformation draft={draft} />}

      <section className="overflow-hidden border border-[#cfdeea] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#103a5c] px-3 py-2 text-white">
          <div>
            <h3 className="text-xs font-semibold">
              {embedded
                ? `${embeddedSectionNumber}. Accommodation & Meals — Hotel Verification`
                : "2. Accommodation & Meals — Dynamic Mode Verification"}
            </h3>
            <p className="mt-0.5 text-[9px] text-white/80">
              Actual room allocation, hotel meal plans, supplier-inclusive rates and per-person
              meals.
            </p>
          </div>
          <div className="text-right text-[9px] font-semibold">Exact rooming: {roomingPax}</div>
        </div>

        <div
          className={
            embedded
              ? "hidden"
              : "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#cfdeea] bg-[#f5f8fb] px-3 py-1.5"
          }
        >
          <span className="text-[9px] font-semibold uppercase tracking-wide text-[#6e8195]">
            Review options
          </span>
          {options.map((option, index) => (
            <label
              key={option.key}
              className={`flex cursor-pointer items-center gap-1.5 rounded-sm border border-[#103a5c] px-2 py-1 text-[9px] font-semibold text-white ${visibleOptionKeys.includes(option.key) ? "bg-[#103a5c]" : "bg-white text-[#103a5c]"}`}
            >
              <Checkbox
                checked={visibleOptionKeys.includes(option.key)}
                onCheckedChange={(checked) => toggleOption(option.key, checked === true)}
                className="h-3 w-3 border-white data-[state=checked]:bg-white data-[state=checked]:text-[#103a5c]"
              />
              Option {option.key} · {option.category || option.label || "Accommodation"}
              <span
                className={`${optionTints[index % optionTints.length]} ml-1 h-2 w-2 border border-white/50`}
              />
            </label>
          ))}
          {options.length === 0 && (
            <span className="text-[9px] text-[#6e8195]">No accommodation options saved.</span>
          )}
        </div>

        <div
          className={
            embedded
              ? "hidden"
              : "flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[#cfdeea] bg-[#eaf3fb] px-3 py-1.5 text-[9px]"
          }
        >
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
            <Checkbox
              checked={includeLunch}
              onCheckedChange={(checked) => setIncludeLunch(checked === true)}
              className="h-3 w-3"
            />
            Include additional Lunch
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
            <Checkbox
              checked={includeDinner}
              onCheckedChange={(checked) => setIncludeDinner(checked === true)}
              className="h-3 w-3"
            />
            Include additional Dinner
          </label>
          <span className="text-[#6e8195]">
            Hotel meal-plan inclusions remain part of the contracted hotel price.
          </span>
        </div>

        <div className="space-y-2 p-2">
          <div className="overflow-hidden border border-[#cfdeea]">
            <div className="flex items-center justify-between gap-3 bg-[#f5f8fb] px-2 py-1.5">
              <span className="text-[10px] font-semibold text-[#16344f]">
                A. Hotel Foreseen / Stay Plan
              </span>
              <span className="text-[8px] text-[#6e8195]">
                Hotel, meal plan and actual room category × quantity only
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className={`${gridTable} min-w-[900px]`}>
                <thead className="bg-[#eaf3fb] text-[8px] font-semibold uppercase text-[#16344f]">
                  <tr>
                    <th className="text-left">Check-in</th>
                    <th className="text-left">Check-out</th>
                    <th className="text-center">Nights</th>
                    <th className="text-left">City</th>
                    {visibleOptions.map((option) => (
                      <th
                        key={option.key}
                        className={`min-w-[220px] text-left ${optionTints[options.findIndex((item) => item.key === option.key) % optionTints.length]}`}
                      >
                        Option {option.key} · {option.category || option.label || "Accommodation"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stays.map((day, index) => {
                    const nextDay = draft.routing.find((item) => item.day === day.day + 1);
                    const checkIn =
                      day.date ||
                      addDaysISO(draft.start_date, Math.max(0, draft.routing.indexOf(day)));
                    const checkOut = nextDay?.date || addDaysISO(checkIn, 1);
                    const city = db.cities.find((item) => item.id === day.city_id)?.name || "—";
                    return (
                      <tr key={`${day.day}-${index}`} className="align-top">
                        <td className="whitespace-nowrap">{fmtDateShort(checkIn)}</td>
                        <td className="whitespace-nowrap">{fmtDateShort(checkOut)}</td>
                        <td className="text-center">1</td>
                        <td className="font-semibold">{city}</td>
                        {visibleOptions.map((option) => {
                          const selection = hotelSelectionForDay(option, day, true);
                          const hotel = db.hotels.find((item) => item.id === selection?.hotel_id);
                          const rooming = (option.dynamic_allocations?.[day.day] ?? []).map(
                            (allocation) => {
                              const room = db.room_categories.find(
                                (item) => item.id === allocation.room_id,
                              );
                              const name = room?.name || "Room category pending";
                              return `${allocation.rooms} × ${name} ${occupancyLabel(allocation.occupancy)}`;
                            },
                          );
                          return (
                            <td key={option.key} className="min-w-[220px] whitespace-normal">
                              {selection?.no_hotel ? (
                                <>
                                  <div className="font-semibold">No Hotel</div>
                                  <div className="text-[8px] text-[#6e8195]">Rooming: —</div>
                                </>
                              ) : selection?.hotel_id ? (
                                <>
                                  <div className="font-bold">
                                    {hotel?.name || "Hotel not found"}
                                  </div>
                                  <div className="text-[8px] text-[#6e8195]">
                                    Meal Plan: {selection.meal_plan || "—"}
                                  </div>
                                  <div className="mt-0.5 text-[8px]">
                                    Rooming: {rooming.length ? rooming.join(" · ") : "—"}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-semibold text-[#6e8195]">
                                    Hotel not selected
                                  </div>
                                  <div className="text-[8px]">
                                    Rooming: {rooming.length ? rooming.join(" · ") : "—"}
                                  </div>
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {stays.length === 0 && (
                    <tr>
                      <td
                        colSpan={4 + visibleOptions.length}
                        className="py-3 text-center text-[#6e8195]"
                      >
                        No overnight routing stays.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden border border-[#cfdeea]">
            <div className="flex items-center justify-between gap-3 bg-[#f5f8fb] px-2 py-1.5">
              <span className="text-[10px] font-semibold text-[#16344f]">
                B. Accommodation &amp; Meals — Room-wise Rate Verification
              </span>
              <span className="text-[8px] text-[#6e8195]">
                Actual allocation and separate Lunch / Dinner (PP) per stay
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className={`${gridTable} min-w-[1050px]`}>
                <thead className="text-[8px] font-semibold uppercase text-[#16344f]">
                  <tr className="bg-[#eaf3fb]">
                    <th rowSpan={2} className="min-w-[46px] text-left">
                      Stay
                    </th>
                    <th rowSpan={2} className="min-w-[94px] text-left">
                      Check-in
                    </th>
                    <th rowSpan={2} className="min-w-[94px] text-left">
                      Check-out
                    </th>
                    <th rowSpan={2} className="min-w-[38px] text-center">
                      Nights
                    </th>
                    <th rowSpan={2} className="min-w-[95px] text-left">
                      City
                    </th>
                    {visibleOptions.map((option) => (
                      <th
                        key={option.key}
                        className={`${optionTints[options.findIndex((item) => item.key === option.key) % optionTints.length]} text-center`}
                      >
                        Option {option.key} · {option.category || option.label || "Accommodation"}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-[#f7fbff]">
                    {visibleOptions.map((option) => (
                      <th key={option.key} className="min-w-[400px] text-left">
                        Nested room lines + additional meals
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stays.map((day, index) => {
                    const checkIn =
                      day.date ||
                      addDaysISO(draft.start_date, Math.max(0, draft.routing.indexOf(day)));
                    const nextDay = draft.routing.find((item) => item.day === day.day + 1);
                    const checkOut = nextDay?.date || addDaysISO(checkIn, 1);
                    const city = db.cities.find((item) => item.id === day.city_id)?.name || "—";
                    return (
                      <tr key={`${day.day}-${index}`} className="align-top">
                        <td className="font-semibold">Stay {index + 1}</td>
                        <td className="whitespace-nowrap">{fmtDateShort(checkIn)}</td>
                        <td className="whitespace-nowrap">{fmtDateShort(checkOut)}</td>
                        <td className="text-center">1</td>
                        <td className="font-semibold">{city}</td>
                        {optionData.map((data) => {
                          const selection = hotelSelectionForDay(data.option, day, true);
                          const noHotel = Boolean(selection?.no_hotel);
                          const rawAllocations = data.option.dynamic_allocations?.[day.day] ?? [];
                          const nightLines = data.roomLines.filter((line) => line.day === day.day);
                          const resolved = new Set(nightLines.map((line) => line.allocation_id));
                          const unresolved = noHotel
                            ? []
                            : rawAllocations.filter((allocation) => !resolved.has(allocation.id));
                          const capacity = nightLines.reduce((sum, line) => sum + line.capacity, 0);
                          const nightTotal = nightLines.reduce(
                            (sum, line) => sum + line.line_total,
                            0,
                          );
                          const allocationIssue = data.allocationIssueDays.includes(day.day);
                          const roomLines = [
                            ...nightLines.map((line) => ({
                              id: line.allocation_id,
                              name: line.room_name,
                              occupancy: occupancyLabel(line.occupancy),
                              qty: line.rooms,
                              net: line.net_rate,
                              gst: line.supplier_gst_per_room,
                              inclusive: line.rate_inclusive_gst,
                              total: line.line_total,
                              capacity: line.capacity,
                              valid: true,
                            })),
                            ...unresolved.map((allocation) => ({
                              id: allocation.id,
                              name:
                                db.room_categories.find((room) => room.id === allocation.room_id)
                                  ?.name || "Room category pending",
                              occupancy: occupancyLabel(allocation.occupancy),
                              qty: allocation.rooms,
                              net: undefined,
                              gst: undefined,
                              inclusive: undefined,
                              total: undefined,
                              capacity:
                                allocation.rooms *
                                ({ single: 1, double: 2, triple: 3, quad: 4 } as const)[
                                  allocation.occupancy
                                ],
                              valid: false,
                            })),
                          ];
                          const lunchRows = data.mealRows.filter(
                            (row) => row.day === day.day && row.meal_type === "Lunch",
                          );
                          const dinnerRows = data.mealRows.filter(
                            (row) => row.day === day.day && row.meal_type === "Dinner",
                          );
                          const lineMeal = (kind: MealKind, rows: typeof lunchRows) => {
                            const coverage = mealPlanCoverage(selection?.meal_plan);
                            if (coverage[kind.toLowerCase() as "lunch" | "dinner"])
                              return "Included";
                            const enabled = kind === "Lunch" ? includeLunch : includeDinner;
                            if (!enabled) return "Excluded";
                            if (rows.length > 0) {
                              const basePp = rows.reduce((sum, row) => sum + row.per_person, 0);
                              return data.pax > 0
                                ? inr(commercialSummary(basePp, markupRate, gstRate).final)
                                : "—";
                            }
                            return "—";
                          };
                          return (
                            <td
                              key={data.option.key}
                              className="min-w-[400px] whitespace-normal align-top"
                            >
                              {noHotel ? (
                                <div className="py-2 text-[9px] font-semibold text-[#6e8195]">
                                  No Hotel · Rooming: — · Accommodation: —
                                </div>
                              ) : (
                                <>
                                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <div className="font-bold">
                                        {db.hotels.find((hotel) => hotel.id === selection?.hotel_id)
                                          ?.name ||
                                          (selection?.hotel_id
                                            ? "Hotel not found"
                                            : "Hotel not selected")}
                                      </div>
                                      <div className="text-[8px] text-[#6e8195]">
                                        Meal Plan: {selection?.meal_plan || "—"}
                                      </div>
                                    </div>
                                    <div className="flex gap-3 text-[8px]">
                                      <span>
                                        Lunch (PP): <b>{lineMeal("Lunch", lunchRows)}</b>
                                      </span>
                                      <span>
                                        Dinner (PP): <b>{lineMeal("Dinner", dinnerRows)}</b>
                                      </span>
                                    </div>
                                  </div>
                                  <table className="w-full border-separate border-spacing-0 text-[8px]">
                                    <thead className="bg-[#f7fbff] text-[#6e8195]">
                                      <tr>
                                        <th className="border border-[#cfdeea] px-1 py-0.5 text-left">
                                          Room Category
                                        </th>
                                        <th className="border border-[#cfdeea] px-1 py-0.5">
                                          Occ.
                                        </th>
                                        <th className="border border-[#cfdeea] px-1 py-0.5 text-right">
                                          Qty
                                        </th>
                                        <th className="border border-[#cfdeea] px-1 py-0.5 text-right">
                                          Net (₹)
                                        </th>
                                        <th className="border border-[#cfdeea] px-1 py-0.5 text-right">
                                          GST (₹)
                                        </th>
                                        <th className="border border-[#cfdeea] px-1 py-0.5 text-right">
                                          Rate incl. GST (₹)
                                        </th>
                                        <th className="border border-[#cfdeea] px-1 py-0.5 text-right">
                                          Line Total (₹)
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {roomLines.map((line) => (
                                        <tr key={line.id}>
                                          <td className="border border-[#cfdeea] px-1 py-0.5">
                                            {line.name}
                                          </td>
                                          <td className="border border-[#cfdeea] px-1 py-0.5 text-center">
                                            {line.occupancy}
                                          </td>
                                          <td className="border border-[#cfdeea] px-1 py-0.5 text-right tabular-nums">
                                            {line.qty}
                                          </td>
                                          <td className="border border-[#cfdeea] px-1 py-0.5 text-right tabular-nums">
                                            {line.valid ? inr(line.net!) : "Rate not available"}
                                          </td>
                                          <td className="border border-[#cfdeea] px-1 py-0.5 text-right tabular-nums">
                                            {line.valid ? inr(line.gst!) : "—"}
                                          </td>
                                          <td className="border border-[#cfdeea] px-1 py-0.5 text-right tabular-nums">
                                            {line.valid ? inr(line.inclusive!) : "—"}
                                          </td>
                                          <td className="border border-[#cfdeea] px-1 py-0.5 text-right tabular-nums">
                                            {line.valid ? inr(line.total!) : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                      {roomLines.length === 0 && (
                                        <tr>
                                          <td
                                            colSpan={7}
                                            className="border border-[#cfdeea] px-1 py-1 text-center text-[#6e8195]"
                                          >
                                            {selection?.hotel_id
                                              ? "No dynamic room allocation for this stay."
                                              : "—"}
                                          </td>
                                        </tr>
                                      )}
                                      <tr className="bg-[#dcedfb] font-semibold">
                                        <td
                                          colSpan={6}
                                          className="border border-[#cfdeea] px-1 py-1 text-right"
                                        >
                                          Room Total · {data.pax} Pax
                                          {capacity !== data.pax && (
                                            <span className="ml-2 text-amber-800">
                                              Capacity {capacity} · Allocation mismatch
                                            </span>
                                          )}
                                          {allocationIssue && (
                                            <span className="ml-2 text-amber-800">
                                              Rate validation pending
                                            </span>
                                          )}
                                        </td>
                                        <td className="border border-[#cfdeea] px-1 py-1 text-right tabular-nums">
                                          {roomLines.length > 0 ? inr(nightTotal) : "—"}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  <tr>
                    <td colSpan={5 + visibleOptions.length} className="p-0">
                      <table className="w-full border-separate border-spacing-0 text-[8px]">
                        <thead className="text-[#16344f]">
                          <tr>
                            <th
                              rowSpan={2}
                              className="min-w-[110px] border border-[#cfdeea] bg-[#103a5c] px-2 py-1 text-left text-white"
                            >
                              Summary &amp; Costing
                            </th>
                            {summaries.map(({ data }, index) => (
                              <th
                                key={data.option.key}
                                colSpan={3}
                                className={`border border-[#cfdeea] px-1 py-1 text-center ${optionTints[options.findIndex((item) => item.key === data.option.key) % optionTints.length]}`}
                              >
                                Option {data.option.key} ·{" "}
                                {data.option.category || data.option.label || "Accommodation"} ·{" "}
                                {data.pax} Pax
                              </th>
                            ))}
                          </tr>
                          <tr className="bg-[#f7fbff]">
                            {summaries.flatMap(({ data }) => [
                              <th
                                key={`${data.option.key}-accommodation`}
                                className="border border-[#cfdeea] px-1 py-0.5 text-right"
                              >
                                Accommodation (₹)
                              </th>,
                              <th
                                key={`${data.option.key}-lunch`}
                                className="border border-[#cfdeea] px-1 py-0.5 text-right"
                              >
                                Lunch (₹)
                              </th>,
                              <th
                                key={`${data.option.key}-dinner`}
                                className="border border-[#cfdeea] px-1 py-0.5 text-right"
                              >
                                Dinner (₹)
                              </th>,
                            ])}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: "Total", pick: (item: MealSummary) => item.base },
                            {
                              label: `Markup (${(markupRate * 100).toFixed(2).replace(/\.00$/, "")}%)`,
                              pick: (item: MealSummary) => item.markup,
                            },
                            {
                              label: `GST (${(gstRate * 100).toFixed(2).replace(/\.00$/, "")}%)`,
                              pick: (item: MealSummary) => item.gst,
                            },
                            { label: "Final Total", pick: (item: MealSummary) => item.final },
                          ].map(({ label, pick }) => (
                            <tr
                              key={label}
                              className={
                                label === "Final Total" ? "bg-[#eaf3fb] font-semibold" : ""
                              }
                            >
                              <th className="border border-[#cfdeea] px-1.5 py-0.5 text-left">
                                {label}
                              </th>
                              {summaries.flatMap(({ data, accommodation, lunch, dinner }) =>
                                [accommodation, lunch, dinner].map((item, index) => (
                                  <td
                                    key={`${data.option.key}-${label}-${index}`}
                                    className="border border-[#cfdeea] px-1 py-0.5 text-right tabular-nums"
                                  >
                                    {inr(pick(item))}
                                  </td>
                                )),
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <section className="overflow-hidden border border-[#cfdeea]">
            <div className="bg-[#103a5c] px-3 py-1.5 text-[10px] font-semibold text-white">
              FINAL ACCOMMODATION + SELECTED MEALS PRICE PP
            </div>
            <div
              className="grid gap-px bg-[#cfdeea]"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, visibleOptions.length)}, minmax(240px, 1fr))`,
              }}
            >
              {optionData.length === 0 ? (
                <div className="bg-white p-2 text-[9px] text-[#6e8195]">
                  Enable at least one accommodation option to review.
                </div>
              ) : (
                summaries.map(({ data, accommodation, lunch, dinner }) => {
                  const validPax = data.pax > 0;
                  const allocationPending =
                    data.missingRates > 0 || data.allocationIssueDays.length > 0;
                  const accommodationPp =
                    validPax && !allocationPending ? accommodation.final / data.pax : undefined;
                  const lunchPp = validPax ? lunch.final / data.pax : undefined;
                  const dinnerPp = validPax ? dinner.final / data.pax : undefined;
                  const totalPp =
                    validPax && !allocationPending
                      ? (accommodationPp ?? 0) + (lunchPp ?? 0) + (dinnerPp ?? 0)
                      : undefined;
                  return (
                    <div key={`final-${data.option.key}`} className="bg-white p-2 text-[9px]">
                      <div className="mb-1 font-semibold text-[#16344f]">
                        Option {data.option.key} ·{" "}
                        {data.option.category || data.option.label || "Accommodation"}
                      </div>
                      <div className="text-[#6e8195]">
                        Group accommodation ÷ {data.pax} Pax + selected Lunch PP + selected Dinner
                        PP
                        {allocationPending && (
                          <span className="ml-1 font-semibold text-amber-800">
                            · Allocation/rate validation pending
                          </span>
                        )}
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-2">
                        <span>Accommodation PP</span>
                        <b className="text-right tabular-nums">
                          {accommodationPp == null ? "—" : inr(accommodationPp)}
                        </b>
                        <span>Lunch PP</span>
                        <b className="text-right tabular-nums">
                          {lunchPp == null ? "—" : inr(lunchPp)}
                        </b>
                        <span>Dinner PP</span>
                        <b className="text-right tabular-nums">
                          {dinnerPp == null ? "—" : inr(dinnerPp)}
                        </b>
                      </div>
                      <div className="mt-1 flex items-center justify-between border-t border-[#cfdeea] bg-[#e8f4ea] px-1.5 py-1 font-bold">
                        <span>FINAL PRICE PP</span>
                        <span className="tabular-nums">{totalPp == null ? "—" : inr(totalPp)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <p className="text-[8px] text-[#6e8195]">
            Room allocation is defined independently for each stay and hotel option. Supplier GST is
            shown from contracted hotel rates. Selling markup and GST use the original quotation
            commercial setup. Meals already included in the hotel plan are not charged again.
          </p>
        </div>
      </section>
    </div>
  );
}

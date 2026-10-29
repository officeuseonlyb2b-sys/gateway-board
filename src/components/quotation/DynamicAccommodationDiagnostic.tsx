import { useMemo } from "react";
import { useDB } from "@/lib/mock-store";
import {
  dynamicAccommodationBreakdown,
  dynamicAccommodationRoomLines,
  effectiveAccommodationPax,
  hotelsGst,
  hotelsMarkup,
} from "@/lib/wizard/calc";
import { buildRateSheet } from "@/lib/wizard/costsheet";
import { resolveHotelSelectionForDay, type QuoteDraft } from "@/lib/wizard/types";

const TARGET_DRAFT_ID = "d_t4z3wmvl";

function money(value: number) {
  return Math.round(value).toLocaleString("en-IN");
}

/** Development-only, read-only view of the active draft's Day 4 accommodation boundary. */
export function DynamicAccommodationDiagnostic({ draft }: { draft: QuoteDraft }) {
  const db = useDB();
  const enabled =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("id") === TARGET_DRAFT_ID &&
    new URLSearchParams(window.location.search).get("accommodationDiagnostic") === "1";

  const report = useMemo(() => {
    if (!enabled) return null;
    const day = draft.routing.find((item) => item.day === 4);
    const option = draft.hotel_options.find((item) => item.key === "A");
    if (!day || !option) return { error: "Option A or routing Day 4 is absent." };

    const resolution = resolveHotelSelectionForDay(option, day, true);
    const roomResolution = dynamicAccommodationRoomLines(draft, option, db);
    const dayLines = roomResolution.lines.filter((line) => line.day === day.day);
    const breakdown = dynamicAccommodationBreakdown(draft, option, db);
    const pax = effectiveAccommodationPax(draft, option);
    const markup = breakdown.total * hotelsMarkup(draft);
    const gst = (breakdown.total + markup) * hotelsGst(draft);
    const final = breakdown.total + markup + gst;
    const matrixRow = buildRateSheet(draft, db, option, [])
      .flatMap((group) => group.rows)
      .find((row) => row.pax === pax);
    const selected = resolution.selection;
    const selectedHotel = db.hotels.find((hotel) => hotel.id === selected?.hotel_id);
    const allocations = option.dynamic_allocations?.[day.day] ?? [];

    return {
      routing: { day: day.day, stayDate: day.date, cityId: day.city_id },
      option: { key: option.key, label: option.label, category: option.category },
      candidates: option.selections.flatMap((selection, index) =>
        selection.routing_day === day.day
          ? [
              {
                index,
                cityId: selection.city_id,
                hotelId: selection.hotel_id || null,
                hotelName:
                  db.hotels.find((hotel) => hotel.id === selection.hotel_id)?.name || null,
                roomId: selection.room_id || null,
                noHotel: Boolean(selection.no_hotel),
                accommodationStatus: selection.accommodation_status || null,
                mealPlan: selection.meal_plan,
              },
            ]
          : [],
      ),
      resolver: {
        reason: resolution.reason,
        selectedIndex: resolution.selectionIndex ?? null,
        selectedHotelId: selected?.hotel_id || null,
        selectedHotelName: selectedHotel?.name || null,
        accommodationStatus: selected?.accommodation_status || null,
      },
      allocations: {
        combinationCount: allocations.length,
        combinations: allocations.map((allocation) => ({
          roomId: allocation.room_id,
          roomName:
            db.room_categories.find((room) => room.id === allocation.room_id)?.name || null,
          occupancy: allocation.occupancy,
          rooms: allocation.rooms,
        })),
        paxAllocated: dayLines.reduce((sum, line) => sum + line.capacity, 0),
        paxRequired: pax,
        nightSupplierInclusive: dayLines.reduce((sum, line) => sum + line.line_total, 0),
      },
      consumers: {
        step8SupplierInclusive: breakdown.total,
        step8Markup: markup,
        step8Gst: gst,
        step8Final: final,
        step8PerPerson: final / Math.max(1, pax),
        finalReviewSupplierInclusive: breakdown.total,
        finalReviewRoomLineCount: roomResolution.lines.length,
        commercialMatrixAccommodationPerPerson: matrixRow?.single ?? null,
      },
      display: {
        night: `₹${money(dayLines.reduce((sum, line) => sum + line.line_total, 0))}`,
        supplier: `₹${money(breakdown.total)}`,
        final: `₹${money(final)}`,
        perPerson: `₹${money(final / Math.max(1, pax))}`,
      },
    };
  }, [db, draft, enabled]);

  if (!enabled || !report) return null;
  return (
    <details className="mb-4 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-xs" open>
      <summary className="cursor-pointer font-bold text-amber-950">
        Development diagnostic · Draft {TARGET_DRAFT_ID} · Option A · Day 4 · read only
      </summary>
      <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap break-all text-[11px]">
        {JSON.stringify(report, null, 2)}
      </pre>
    </details>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, Pencil, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { brochurePricingCoverage, useBrochures } from "@/lib/brochures-store";
import { useDB } from "@/lib/mock-store";
import { useAuth } from "@/lib/auth-mock";
import {
  explicitlySavedRoutingItineraries,
  listItineraries,
  type ItineraryRecord,
} from "@/lib/itineraries-store";
import { emptyDraft, type QuoteDraft, type RoutingDay } from "@/lib/wizard/types";
import { saveManualRoutingToItineraryMaster } from "@/lib/wizard/customized-routing-save";
import { CustomizedRoutingEditor } from "@/routes/_authenticated/costing";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/brochures/itinerary-master")({
  head: () => ({ meta: [{ title: "Itinerary Master — MP Tourism Hub" }] }),
  component: ItineraryMasterPage,
});

function ManualRoutingForm({
  draft,
  set,
  cities,
  editing,
  saving,
  onSave,
  onCancel,
}: {
  draft: QuoteDraft;
  set: (patch: Partial<QuoteDraft>) => void;
  cities: { id: string; name: string }[];
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const selectCity = (value: string, onChange: (name: string) => void, placeholder: string) => (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {cities.map((city) => (
        <option key={city.id} value={city.name}>
          {city.name}
        </option>
      ))}
    </select>
  );
  return (
    <Card className="mb-4 border-primary/30 p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">
            {editing ? "Edit Manual Routing" : "Create Manual Routing"}
          </h2>
          <p className="text-xs text-muted-foreground">
            This saves only a canonical Programme routing to Itinerary Master. It never creates a
            quotation, costing snapshot, or portal publication.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-4 w-4" />
          Cancel
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-1 text-xs font-medium">
          Programme / Package Name
          <Input
            value={draft.new_program_name || ""}
            onChange={(event) =>
              set({ new_program_name: event.target.value, program_name: event.target.value })
            }
            placeholder="Programme name"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Programme Code
          <Input
            value={draft.new_program_code || ""}
            onChange={(event) =>
              set({
                new_program_code: event.target.value.toUpperCase(),
                program_code: event.target.value.toUpperCase(),
              })
            }
            placeholder="Auto-generated if blank"
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          Starting City
          {selectCity(
            draft.tour_start_city || "",
            (value) => set({ tour_start_city: value, departure_city: value }),
            "Select city",
          )}
        </label>
        <label className="space-y-1 text-xs font-medium">
          Ending City
          {selectCity(
            draft.tour_end_city || "",
            (value) => set({ tour_end_city: value }),
            "Select city",
          )}
        </label>
        <label className="space-y-1 text-xs font-medium">
          Nights
          <Input
            type="number"
            min={1}
            value={draft.nights}
            onChange={(event) => set({ nights: Math.max(1, Number(event.target.value) || 1) })}
          />
          <span className="block font-normal text-muted-foreground">{draft.nights + 1} days</span>
        </label>
      </div>
      <div className="mt-4 border-t pt-4">
        <CustomizedRoutingEditor draft={draft} set={set} onSaveCustomizedRouting={onSave} />
      </div>
      {saving && (
        <p className="mt-2 text-xs text-muted-foreground">
          Saving and verifying routing storageâ€¦
        </p>
      )}
    </Card>
  );
}

function ItineraryMasterPage() {
  const brochures = useBrochures();
  const db = useDB();
  const user = useAuth();
  const [records, setRecords] = useState<ItineraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [manualDraft, setManualDraft] = useState<QuoteDraft | null>(null);
  const [editingManualId, setEditingManualId] = useState<string>();
  const [savingManual, setSavingManual] = useState(false);

  const newManualDraft = useCallback(
    (): QuoteDraft => ({
      ...emptyDraft(),
      query_type: "B2C",
      has_dates: false,
      program_mode: "new",
      save_program_as_new: true,
      nights: 1,
      new_program_name: "",
      new_program_code: "",
      program_name: "",
      program_code: "",
      tour_start_city: "",
      tour_end_city: "",
      departure_city: "",
      routing: [],
    }),
    [],
  );
  const startManualRouting = useCallback(
    (record?: ItineraryRecord) => {
      if (!record?.routingSnapshot) {
        setEditingManualId(undefined);
        setManualDraft(newManualDraft());
        return;
      }
      const snapshot = record.routingSnapshot;
      const cityId = (name: string | null | undefined) =>
        db.cities.find((city) => city.name.toLocaleLowerCase() === (name || "").toLocaleLowerCase())
          ?.id || "";
      const routing: RoutingDay[] = snapshot.routing.map((row, index) => ({
        day: row.day,
        is_day_zero: row.day === 0,
        date: "",
        city_id: cityId(row.overnight_city || row.destination_city),
        to_city_id: cityId(row.destination_city),
        to_city_ids: (row.to_cities || []).map(cityId).filter(Boolean),
        from_city: row.from_city || "",
        to_city: row.destination_city || "",
        travel_by: row.travel_mode as RoutingDay["travel_by"],
        program: row.program_text || "",
        program_mode: "text",
        overnight: Boolean(row.overnight_city),
        tours_selected_by_city: Object.fromEntries(
          Object.entries(row.tour_titles_by_city || {})
            .map(([name, titles]) => [cityId(name), titles])
            .filter(([id]) => Boolean(id)),
        ),
        tour_title: row.tour_titles?.[0] || "",
      }));
      setEditingManualId(record.id);
      setManualDraft({
        ...newManualDraft(),
        nights: snapshot.nights,
        new_program_name: snapshot.programmeName,
        new_program_code: snapshot.programmeCode,
        program_name: snapshot.programmeName,
        program_code: snapshot.programmeCode,
        tour_start_city: snapshot.startCity,
        departure_city: snapshot.startCity,
        tour_end_city: snapshot.endCity,
        routing,
      });
    },
    [db.cities, newManualDraft],
  );
  const updateManualDraft = useCallback(
    (patch: Partial<QuoteDraft>) =>
      setManualDraft((current) => (current ? { ...current, ...patch } : current)),
    [],
  );
  const saveManualRouting = useCallback(async () => {
    if (!manualDraft) return;
    setSavingManual(true);
    try {
      const result = await saveManualRoutingToItineraryMaster(
        manualDraft,
        db.cities,
        user?.name || "Manual routing author",
        editingManualId,
      );
      setRecords(await listItineraries());
      setExpandedId(result.itinerary.id);
      setManualDraft(null);
      setEditingManualId(undefined);
      toast.success(
        editingManualId
          ? "Manual routing updated in Itinerary Master."
          : "Manual routing saved to Itinerary Master.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Manual routing could not be saved.");
    } finally {
      setSavingManual(false);
    }
  }, [db.cities, editingManualId, manualDraft, user?.name]);

  useEffect(() => {
    let mounted = true;
    listItineraries()
      .then((items) => mounted && setRecords(items))
      .catch(() => mounted && setRecords([]))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      explicitlySavedRoutingItineraries(records)
        .flatMap((record) => {
          // The eligibility predicate guarantees this immutable snapshot exists.
          const routing = record.routingSnapshot!;
          const term = search.trim().toLocaleLowerCase();
          const searchable = [
            routing.programmeName,
            routing.programmeCode,
            routing.startCity,
            routing.endCity,
            routing.routingSummary,
          ]
            .join(" ")
            .toLocaleLowerCase();
          return !term || searchable.includes(term) ? [{ record, routing }] : [];
        })
        .sort((left, right) => right.routing.savedAt.localeCompare(left.routing.savedAt)),
    [records, search],
  );

  return (
    <div className="min-h-full bg-slate-100/70 p-4 sm:p-6">
      <div className="mx-auto max-w-[1700px]">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white text-slate-800 shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Itinerary Master</h1>
              <p className="text-xs text-slate-500 sm:text-sm">
                Explicitly saved customized routings, linked to their canonical Programme and
                editable itinerary content.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-9 text-xs" onClick={() => startManualRouting()}>
              <Plus className="mr-2 h-4 w-4" />
              Create Manual Routing
            </Button>
          </div>
        </header>

        {manualDraft && (
          <ManualRoutingForm
            draft={manualDraft}
            set={updateManualDraft}
            cities={db.cities}
            editing={Boolean(editingManualId)}
            saving={savingManual}
            onSave={() => void saveManualRouting()}
            onCancel={() => {
              setManualDraft(null);
              setEditingManualId(undefined);
            }}
          />
        )}

        <Card className="mb-3 p-3">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-9 bg-white pl-9 text-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Programme, code, city or route…"
            />
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Only routings explicitly saved from Quotation Builder or Create Manual Routing are
            listed. Programme Master records without an explicit routing save are not imported here.
          </p>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] uppercase text-slate-600">
                <tr>
                  <th className="p-2">Itinerary / Package Name</th>
                  <th className="p-2">Linked Programme</th>
                  <th className="p-2">Duration</th>
                  <th className="p-2">Routing Summary</th>
                  <th className="p-2">Starting / Ending City</th>
                  <th className="p-2">Brochure Costing Status</th>
                  <th className="p-2">Pricing Version / Coverage</th>
                  <th className="p-2">Itinerary Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ record, routing }) => {
                  // Persisted Brochure snapshots are authoritative; a saved
                  // Ready-for-Review snapshot must not depend on a legacy quote
                  // cache before it can be shown against this routing.
                  const pricingVersion = brochures
                    .filter(
                      (version) => version.status !== "Draft" && version.status !== "Archived",
                    )
                    .filter((version) => version.programme_id === routing.programmeId)
                    .filter(
                      (version) =>
                        !routing.routingFingerprint ||
                        !version.route_fingerprint ||
                        version.route_fingerprint === routing.routingFingerprint,
                    )
                    .sort(
                      (left, right) =>
                        right.version - left.version ||
                        right.updated_at.localeCompare(left.updated_at),
                    )[0];
                  const costingComplete = Boolean(pricingVersion);
                  const costingLabel =
                    pricingVersion?.status === "Published"
                      ? "Published"
                      : pricingVersion
                        ? "Costing Saved"
                        : "Costing Pending";
                  const coverage = pricingVersion
                    ? brochurePricingCoverage(pricingVersion)
                    : undefined;
                  const itineraryStatus =
                    record.status === "Published"
                      ? "Published"
                      : record.status === "Routing Saved"
                        ? "Routing Saved / Draft"
                        : "Draft";
                  const expanded = expandedId === record.id;
                  return (
                    <Fragment key={record.id}>
                      <tr className="border-t align-top hover:bg-slate-50">
                        <td className="min-w-48 p-2 font-semibold">
                          {record.title || routing.programmeName}
                          <div className="text-[10px] font-normal text-slate-500">
                            {record.code || routing.programmeCode}
                          </div>
                        </td>
                        <td className="p-2">
                          {routing.programmeName}
                          <div className="text-[10px] text-slate-500">
                            {routing.programmeCode} · ID {routing.programmeId}
                          </div>
                        </td>
                        <td className="whitespace-nowrap p-2">
                          {routing.nights}N / {routing.daysCount}D
                        </td>
                        <td className="max-w-80 p-2 text-slate-600">
                          {routing.routingSummary || "Routing details unavailable"}
                        </td>
                        <td className="p-2">
                          {routing.startCity || "—"} → {routing.endCity || "—"}
                        </td>
                        <td className="p-2">
                          <Badge variant={costingComplete ? "default" : "secondary"}>
                            {costingLabel}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {pricingVersion
                            ? `V${pricingVersion.version} · ${coverage?.configured_pax_range || "Pax range unavailable"}`
                            : "—"}
                          <div className="text-[10px] text-slate-500">
                            {coverage
                              ? `${coverage.readiness} · ${coverage.valid_scenarios} scenarios`
                              : "No finalized pricing snapshot"}
                          </div>
                        </td>
                        <td className="p-2">
                          <Badge
                            variant={itineraryStatus === "Published" ? "default" : "secondary"}
                          >
                            {itineraryStatus}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => setExpandedId(expanded ? "" : record.id)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              {expanded ? "Hide Routing" : "View Routing"}
                            </Button>
                            {routing.sourceType === "manual" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => startManualRouting(record)}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Edit Routing
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px]"
                                disabled
                                title="Routing created from a quotation is immutable here."
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Edit Routing
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${record.id}-routing`} className="border-t bg-slate-50">
                          <td colSpan={9} className="p-3">
                            <div className="space-y-2">
                              {routing.routing.map((day) => (
                                <div
                                  key={`${record.id}-${day.day}`}
                                  className="grid gap-1 rounded border bg-white p-2 text-[10px] md:grid-cols-[70px_1fr_1.5fr_1fr_90px]"
                                >
                                  <strong>{day.day === 0 ? "Day 0" : `Day ${day.day}`}</strong>
                                  <span>{day.from_city || routing.startCity || "—"}</span>
                                  <span>
                                    {(day.to_cities?.length
                                      ? day.to_cities
                                      : [
                                          ...(day.intermediate_cities || []),
                                          day.destination_city || "",
                                        ].filter(Boolean)
                                    ).join(" → ") || "—"}
                                  </span>
                                  <span>
                                    {day.tour_titles?.join(" · ") ||
                                      Object.values(day.tour_titles_by_city || {})
                                        .flat()
                                        .join(" · ") ||
                                      day.program_text ||
                                      "—"}
                                  </span>
                                  <span>
                                    {day.overnight_city
                                      ? `Overnight: ${day.overnight_city}`
                                      : day.travel_mode || "Departure"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {loading && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-slate-500">
                      Loading explicitly saved routing records…
                    </td>
                  </tr>
                )}
                {!loading && !rows.length && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      No explicitly saved routing records yet. Continue in Quotation Builder does
                      not save to this master.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t px-3 py-2 text-[10px] text-slate-500">
            Pricing is shown only when a finalized eligible snapshot matches this canonical
            Programme and routing identity. No prices are inferred or recalculated here.
          </p>
        </Card>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Save,
  Plus,
  Trash2,
  Building2,
  User,
  Users,
  FileText,
  Star,
  AlertCircle,
  X,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { inr, addDaysISO, fmtDateShort } from "@/lib/format";
import {
  useDB,
  MEAL_PLANS,
  type MealPlan,
  guideRateForPax,
  activityRateForPax,
  GUIDE_LANGUAGES,
  guideConfiguredLanguages,
  miscRateForPax,
  type GuideLanguage,
} from "@/lib/mock-store";
import { useAuth } from "@/lib/auth-mock";
import { useDraft, writeDraft, clearDraft, initDraft, loadDraft } from "@/lib/wizard/store";
import { upsertDraft, getDraft, deleteDraft, migrateLegacyDraft } from "@/lib/drafts-store";
import { addNotification } from "@/lib/notifications-store";
import type {
  QuoteDraft,
  QueryType,
  RoutingDay,
  OptionKey,
  HotelOption,
  PersonAllocation,
  PersonRoomType,
} from "@/lib/wizard/types";
import { emptyDraft } from "@/lib/wizard/types";
import {
  addProgram,
  getPrograms,
  nextProgramCode,
  useAgents,
  usePrograms,
  type Agent,
} from "@/lib/wizard/agents-store";
import {
  computeAddonsTotal,
  totalPax,
  effectivePaxForPricing,
  gstRateFor,
  transportLineTotal,
  computePersonTotals,
  optionUsesCustomAllocation,
  normalizeAllocations,
  defaultAllocations,
  presetAllSingle,
  presetAllDouble,
  presetOneSingleRestDouble,
  personRoomTypeLabel,
  lookupOptionNightlyRates,
  isGroupTour,
  autoDoubleMix,
  autoTripleMix,
  mixCoversPax,
  mixLabel,
  computeGroupOption,
  type OptionTotals,
  type PersonOptionTotal,
  type GroupOptionTotals,
} from "@/lib/wizard/calc";
import { computeScenario } from "@/lib/wizard/scenario";
import { buildLandPart } from "@/lib/wizard/costsheet";
import { validateQuoteForFinalization } from "@/lib/wizard/validation";

import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import { defaultsForCategory } from "@/lib/wizard/category-defaults";
import { saveQuote as persistQuote, type SavedQuote } from "@/lib/quotes-store";
import { buildSavedQuote as buildSavedQuoteFromDraft } from "@/lib/wizard/build-saved-quote";
import { getCrmQuery, saveQueryCosting, useCrmQueries } from "@/lib/crm/store";
import { pushCrmSnapshotNow } from "@/lib/crm/crm-remote";

import { setActiveWizard } from "@/lib/wizard/active-wizard";
import { QuoteViewerDialog } from "@/components/QuoteViewerDialog";
import { QuickAddHotelDialog } from "@/components/QuickAddHotelDialog";
import { AgentFormDialog } from "@/components/AgentFormDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { uid, CustomAdd } from "@/components/quotation/shared";
import { Step10 } from "@/components/quotation/steps/StepTransport";
import { Step11 } from "@/components/quotation/steps/StepActivities";
import { Step12 } from "@/components/quotation/steps/StepEntrances";
import { Step13 } from "@/components/quotation/steps/StepGuide";
import { Step14 } from "@/components/quotation/steps/StepMisc";
import { Step15 } from "@/components/quotation/steps/StepHotels";
import { Step16 } from "@/components/quotation/steps/StepCosting";
import { Step17 } from "@/components/quotation/steps/StepFinal";

import { StepMeals } from "@/components/quotation/steps/StepMeals";

export const Route = createFileRoute("/_authenticated/costing")({
  head: () => ({ meta: [{ title: "New Quotation — MP Tourism Hub" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string; queryId?: string } => ({
    id: typeof s.id === "string" ? s.id : undefined,
    queryId: typeof s.queryId === "string" ? s.queryId : undefined,
  }),
  component: WizardPage,
});

// ============================================================
// Step definitions — Room Allocation now lives inside Hotels → 15 steps
// ============================================================
const TOTAL_STEPS = 10;
const STEPS: { n: number; label: string; subs?: string[] }[] = [
  { n: 1, label: "Type" },
  { n: 2, label: "Who" },
  { n: 3, label: "Trip Basics" },
  { n: 4, label: "Program" },
  { n: 5, label: "Routing" },
  { n: 6, label: "Land Part", subs: ["Activity", "Guide", "Entrances", "Misc", "Transport"] },
  { n: 7, label: "Accommodation Part", subs: ["Hotels", "Meals"] },
  { n: 8, label: "Costing" },
  { n: 9, label: "Optional Supplements" },
  { n: 10, label: "Final Review" },
];

const FLOW_GROUPS = [
  {
    label: "Quote Setup",
    description: "Quotation type and recipient",
    steps: [1, 2],
  },
  {
    label: "Trip Brief",
    description: "Travellers, dates and travel",
    steps: [3],
  },
  {
    label: "Program & Routing",
    description: "Programme selection and day plan",
    steps: [4, 5],
  },
  {
    label: "Services & Stay",
    description: "Land services, hotels and meals",
    steps: [6, 7],
  },
  {
    label: "Review & Generate",
    description: "Costing, supplements and controlled generation",
    steps: [8, 9, 10],
  },
] as const;

/** Brochure departure ex-points (Ex-City list) */
const BROCHURE_EX_CITIES = [
  "Ex-Bhopal",
  "Ex-Indore",
  "Ex-Jabalpur",
  "Ex-Gwalior",
  "Ex-Ujjain",
  "Ex-Delhi",
  "Ex-Mumbai",
  "Ex-Nagpur",
  "Ex-Raipur",
];

const CATEGORY_TAGS = [
  "Wildlife",
  "Heritage",
  "Pilgrimage",
  "Adventure",
  "Beach",
  "Hill Station",
  "Cultural",
  "Corporate",
  "Honeymoon",
  "Family",
];
function ensureProgramInMaster(
  draft: QuoteDraft,
  db: ReturnType<typeof useDB>,
  savedBy: string,
): QuoteDraft {
  const saveCustomizedCopy = draft.program_mode === "existing" && draft.save_program_as_new;
  const shouldCreate = draft.program_mode === "new" || saveCustomizedCopy;
  const targetName = (saveCustomizedCopy ? draft.new_program_name : draft.program_name)?.trim();
  if (!shouldCreate || !targetName) return draft;
  const requestedCode = (
    (saveCustomizedCopy ? draft.new_program_code : draft.program_code) || nextProgramCode()
  ).trim().toUpperCase();
  // A new/customized routing never overwrites a master, even if somebody
  // manually reuses an existing code.
  const conflict = getPrograms().find((program) => program.code === requestedCode);
  const code = conflict ? nextProgramCode() : requestedCode;
  if (conflict)
    toast.warning(
      `${requestedCode} already belongs to “${conflict.name}”. Saved the new routing as ${code}.`,
    );
  const cityName = (id?: string) => db.cities.find((city) => city.id === id)?.name || "";
  const cities = Array.from(
    new Set(
      draft.routing
        .flatMap((day) => [
          cityName(day.city_id),
          cityName(day.to_city_id),
          day.from_city || "",
          day.to_city || "",
        ])
        .filter(Boolean),
    ),
  );
  const routing = draft.routing.map((day) => ({
    day: day.day,
    overnight_city: day.overnight ? cityName(day.city_id) || day.to_city || null : null,
    program_text: day.program || "",
    from_city: day.from_city,
    destination_city: cityName(day.to_city_id) || day.to_city,
  }));
  const routingSummary =
    cities.join(" → ") ||
    draft.routing
      .map((day) => day.program)
      .filter(Boolean)
      .join(" · ");
  addProgram({
    id: code,
    code,
    name: targetName,
    nights: draft.nights,
    days: Math.max(1, draft.nights + 1),
    duration_label: `${draft.nights} Nights & ${draft.nights + 1} Days`,
    routing_summary: routingSummary,
    routing,
    cities,
    categories: draft.categories,
    departure_city: cityName(draft.departure_city) || draft.departure_city,
    travel_modes: draft.travel_modes,
    inclusions: draft.inclusions,
    exclusions: draft.exclusions,
    source: "Quotation Builder",
    status: "Active",
    created_by: savedBy,
  });
  const updated = {
    ...draft,
    program_id: code,
    program_code: code,
    program_name: targetName,
    program_mode: "existing" as const,
    save_program_as_new: false,
    new_program_code: "",
    new_program_name: "",
  };
  writeDraft(updated);
  return updated;
}

/** Major Indian cities available for "Guest Travelling From" */
const INDIAN_CITIES = [
  "Agra",
  "Ahmedabad",
  "Ajmer",
  "Amritsar",
  "Aurangabad",
  "Bengaluru",
  "Bhopal",
  "Bhubaneswar",
  "Chandigarh",
  "Chennai",
  "Coimbatore",
  "Dehradun",
  "Delhi",
  "Gangtok",
  "Goa",
  "Guwahati",
  "Gwalior",
  "Hyderabad",
  "Indore",
  "Jabalpur",
  "Jaipur",
  "Jaisalmer",
  "Jammu",
  "Jodhpur",
  "Kanpur",
  "Khajuraho",
  "Kochi",
  "Kolkata",
  "Leh",
  "Lucknow",
  "Ludhiana",
  "Madurai",
  "Mangalore",
  "Mumbai",
  "Mysuru",
  "Nagpur",
  "Nashik",
  "Patna",
  "Puducherry",
  "Pune",
  "Raipur",
  "Ranchi",
  "Rishikesh",
  "Shimla",
  "Siliguri",
  "Srinagar",
  "Surat",
  "Thiruvananthapuram",
  "Tiruchirappalli",
  "Udaipur",
  "Ujjain",
  "Vadodara",
  "Varanasi",
  "Vijayawada",
  "Visakhapatnam",
].sort();

const INTERNATIONAL_CITIES = [
  "Abu Dhabi",
  "Amsterdam",
  "Auckland",
  "Bangkok",
  "Barcelona",
  "Beijing",
  "Berlin",
  "Cape Town",
  "Colombo",
  "Dhaka",
  "Doha",
  "Dubai",
  "Frankfurt",
  "Hong Kong",
  "Istanbul",
  "Jakarta",
  "Johannesburg",
  "Kathmandu",
  "Kuala Lumpur",
  "Kuwait City",
  "London",
  "Los Angeles",
  "Male",
  "Manila",
  "Melbourne",
  "Moscow",
  "Muscat",
  "New York",
  "Paris",
  "Riyadh",
  "Rome",
  "San Francisco",
  "Seoul",
  "Shanghai",
  "Singapore",
  "Sydney",
  "Tokyo",
  "Toronto",
  "Vancouver",
  "Vienna",
  "Zurich",
].sort();

// ============================================================
// Root
// ============================================================
function WizardPage() {
  const draft = useDraft();
  const dbData = useDB();
  const user = useAuth();
  const search = Route.useSearch();

  const [showBanner, setShowBanner] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [savedQuote, setSavedQuote] = useState<SavedQuote | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    if (initialized) return;
    migrateLegacyDraft();
    if (search.queryId) {
      const query = getCrmQuery(search.queryId);
      if (query) {
        const next = emptyDraft();
        const start = query.travel_start ? new Date(query.travel_start) : null;
        const end = query.travel_end ? new Date(query.travel_end) : null;
        const nights =
          start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
            ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
            : next.nights;
        const isB2B = /b2b|partner|agent/i.test(`${query.lead_source} ${query.market}`);
        const isGroup = /git|group/i.test(`${query.enquiry_type} ${query.travel_type}`);
        writeDraft({
          ...next,
          linked_query_id: query.query_id,
          linked_query_name: query.customer,
          query_type: isB2B ? "B2B" : "B2C",
          tour_type: isGroup ? "GIT" : "FIT",
          agent: isB2B
            ? {
                agent_id: query.agent_id,
                name: query.contact_person,
                agency: query.customer,
                phone: query.mobile,
                email: query.email,
              }
            : next.agent,
          guest: !isB2B
            ? {
                name: query.contact_person || query.customer,
                phone: query.mobile,
                email: query.email,
                city: "",
              }
            : next.guest,
          start_date: query.travel_start || next.start_date,
          nights,
          program_mode: query.program_id ? "existing" : "new",
          program_id: query.program_id,
          program_code: query.program_id,
          program_name: query.program_name || query.destination,
          adults: query.adults || query.pax || next.adults,
          pax_min: query.min_pax || undefined,
          pax_max: query.max_pax || undefined,
          departure_city: query.tour_start_city || next.departure_city,
          tour_start_city: query.tour_start_city || next.tour_start_city,
          tour_end_city: query.tour_end_city || next.tour_end_city,
          children: Array.from({ length: Math.max(0, query.children || 0) }, () => ({ age: 8 })),
          traveler_type:
            query.traveler_type ?? (/inbound/i.test(query.market) ? "foreign" : "indian"),
        });
        setInitialized(true);
        return;
      }
    }
    if (search.id) {
      const rec = getDraft(search.id);
      if (rec) {
        writeDraft(rec.wizard_state);
        setCurrentDraftId(rec.id);
        setInitialized(true);
        return;
      }
    }
    const existing = draft || loadDraft();
    if (existing) setShowBanner(true);
    else initDraft();
    setInitialized(true);
  }, [initialized, search.id, search.queryId, draft]);

  useEffect(() => {
    if (!draft) return;
    if (draft.step <= 1) {
      setActiveWizard(null);
      return;
    }
    setActiveWizard({
      draftId: currentDraftId,
      programName:
        draft.program_name ||
        (draft.query_type === "B2B"
          ? draft.agent.name
          : draft.query_type === "B2C"
            ? draft.guest.name
            : draft.brochure.theme) ||
        "Untitled",
      step: draft.step,
      savedAt: draft.updated_at,
    });
  }, [draft, currentDraftId]);

  // Keep a resumable named draft in sync after the recipient is known. The
  // generated quote is written separately and is never used as an editable draft.
  useEffect(() => {
    if (!initialized || !draft || draft.step < 2) return;
    const timer = window.setTimeout(() => {
      const id = upsertDraft(draft, currentDraftId ?? undefined);
      if (!currentDraftId) setCurrentDraftId(id);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, initialized, currentDraftId]);

  const [sub, setSub] = useState(0);

  if (!draft) {
    return (
      <div className="p-8">
        <Button onClick={() => initDraft()}>Start Quotation</Button>
      </div>
    );
  }

  const step = Math.min(draft.step, TOTAL_STEPS);
  const set = (patch: Partial<QuoteDraft>) => {
    const current = loadDraft() ?? draft;
    writeDraft({ ...current, ...patch });
  };

  const canProceed = validate(draft, step);

  const persistToDrafts = (nextState: QuoteDraft, opts?: { silent?: boolean; name?: string }) => {
    const id = upsertDraft(nextState, currentDraftId ?? undefined, opts?.name);
    if (!currentDraftId) setCurrentDraftId(id);
    if (!opts?.silent) {
      addNotification({
        kind: "info",
        category: "draft_saved",
        title: "Draft saved",
        message: `"${opts?.name || nextState.program_name || "Draft"}" saved. Resume anytime from Drafts.`,
        href: "/drafts",
      });
    }
    return id;
  };

  const finalizeQuote = async () => {
    const latest = loadDraft() ?? draft;
    const review = validateQuoteForFinalization(latest, dbData);
    if (review.blockers.length) {
      toast.error(`Resolve ${review.blockers.length} blocker${review.blockers.length === 1 ? "" : "s"} before generating this quote.`);
      return;
    }
    setIsFinalizing(true);
    try {
      const preparedDraft = ensureProgramInMaster(latest, dbData, user?.name || "Unknown");
      const quote = buildSavedQuoteFromDraft(preparedDraft, dbData, user?.name || "Unknown");
      persistQuote(quote);
      if (preparedDraft.linked_query_id) {
        saveQueryCosting(preparedDraft.linked_query_id, quote, undefined, user?.name || "Unknown");
        try {
          await pushCrmSnapshotNow();
        } catch (error) {
          console.error("Linked costing remote sync failed", error);
          toast.warning("The immutable quote and its Query link were saved locally; remote sync is pending.");
        }
      }
      if (currentDraftId) deleteDraft(currentDraftId);
      setCurrentDraftId(null);
      clearDraft();
      setActiveWizard(null);
      writeDraft(emptyDraft());
      setSavedQuote(quote);
      addNotification({
        kind: "success",
        category: "quote_saved",
        title: `${quote.display_number || quote.quote_number} generated and locked`,
        message: `${quote.tour_title} · ${quote.total_nights}N · revision ${quote.version}`,
        href: "/quotes",
      });
      toast.success(`${quote.display_number || quote.quote_number} generated. This version is now read-only.`);
    } catch (error) {
      console.error("Quote finalization failed", error);
      toast.error(error instanceof Error ? error.message : "Could not generate the quote.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const go = (n: number, subIndex = 0) => {
    if (n < 1 || n > TOTAL_STEPS) return;
    if (n > step && !canProceed) return;
    const current = loadDraft() ?? draft;
    const next = { ...current, step: n };
    writeDraft(next);
    setSub(subIndex);
    if (n > step && n >= 3) {
      persistToDrafts(next, { silent: true });
    }
  };

  const subCount = STEPS[step - 1]?.subs?.length ?? 0;
  const goNext = () => {
    if (subCount > 0 && sub < subCount - 1) {
      setSub(sub + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    go(step + 1);
  };
  const goBack = () => {
    if (subCount > 0 && sub > 0) {
      setSub(sub - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const prevSubs = STEPS[step - 2]?.subs?.length ?? 0;
    go(step - 1, prevSubs > 0 ? prevSubs - 1 : 0);
  };

  const customerLabel =
    draft.query_type === "B2B"
      ? draft.agent.agency || draft.agent.name
      : draft.query_type === "B2C"
        ? draft.guest.name
        : draft.brochure.theme;
  const endDate = addDaysISO(draft.start_date, draft.nights);
  const dateLabel =
    draft.query_type === "Brochure"
      ? draft.brochure_validity_from && draft.brochure_validity_till
        ? `${fmtDateShort(draft.brochure_validity_from)} – ${fmtDateShort(draft.brochure_validity_till)}`
        : "Validity not set"
      : draft.has_dates === false
        ? `${draft.nights}N / ${draft.nights + 1}D · dates flexible`
        : `${fmtDateShort(draft.start_date)} – ${fmtDateShort(endDate)}`;
  const activeFlowGroup = FLOW_GROUPS.find((group) =>
    group.steps.some((stepNumber) => stepNumber === step),
  );

  return (
    <div className="min-h-full bg-muted/20">
      {showBanner && draft.step > 1 && (
        <div className="bg-accent/10 border-b border-accent/30 px-6 py-2 flex items-center justify-between text-sm">
          <span>Resuming draft from {new Date(draft.updated_at).toLocaleString("en-IN")}.</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm" variant="ghost" onClick={() => setShowBanner(false)}>
              Continue
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearDraft();
                initDraft();
                setCurrentDraftId(null);
                setShowBanner(false);
              }}
            >
              Discard & start new
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-[1800px] mx-auto p-4 lg:p-6 xl:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-t-xl border border-b-0 bg-background px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <Calculator className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Quotation Builder</h1>
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  Draft
                </Badge>
                {draft.linked_query_id && (
                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    Linked · {draft.linked_query_id}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {customerLabel ||
                  draft.linked_query_name ||
                  "Start by selecting the quotation type and recipient"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Autosaved{" "}
              {new Date(draft.updated_at).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const name =
                  window.prompt("Name this draft (optional):", draft.program_name || "") ||
                  undefined;
                persistToDrafts(draft, { name });
                toast.success("Draft saved.");
              }}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save Draft
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Discard all progress and start over?")) {
                  if (currentDraftId) deleteDraft(currentDraftId);
                  setCurrentDraftId(null);
                  clearDraft();
                  setActiveWizard(null);
                  writeDraft(emptyDraft());
                }
              }}
            >
              <X className="h-3.5 w-3.5 mr-1.5" /> Discard
            </Button>
          </div>
        </div>
        <div className="grid gap-px overflow-hidden rounded-b-xl border bg-border/60 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <QuoteContextItem label="Current step" value={`${step}. ${STEPS[step - 1].label}`} />
          <QuoteContextItem label="Travel" value={dateLabel} />
          <QuoteContextItem
            label="Travellers"
            value={
              draft.query_type === "Brochure"
                ? `${draft.pax_min || 0}–${draft.pax_max || 0} pax`
                : `${totalPax(draft)} pax · ${draft.tour_type}`
            }
          />
          <QuoteContextItem label="Programme" value={draft.program_name || "Not selected yet"} />
        </div>

        <div className="mt-4 rounded-xl border bg-background px-3 py-2 xl:hidden">
          <ProgressBar step={step} onJump={go} />
        </div>

        <div
          className={cn(
            "mt-5 grid items-start gap-5",
            isFocusMode
              ? "grid-cols-[minmax(0,1fr)]"
              : "xl:grid-cols-[230px_minmax(0,1fr)_280px]",
          )}
        >
          {!isFocusMode && <QuotationNavigator step={step} onJump={go} />}

          <main className="min-w-0">
            <Card className="card-elevated overflow-hidden">
              <div className="flex flex-col gap-2 border-b bg-gradient-to-r from-primary/[0.06] via-background to-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    {activeFlowGroup?.label || "Quotation workspace"}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    Step {step} of {TOTAL_STEPS} · {STEPS[step - 1].label}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">
                    All changes are saved to the active draft
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title={isFocusMode ? "Restore side panels" : "Expand quotation builder"}
                    aria-label={isFocusMode ? "Restore side panels" : "Expand quotation builder"}
                    onClick={() => setIsFocusMode((current) => !current)}
                  >
                    {isFocusMode ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <StepContent draft={draft} set={set} sub={sub} setSub={setSub} />
                {step === 10 && (
                  <FinalizationPanel
                    draft={draft}
                    db={dbData}
                    isFinalizing={isFinalizing}
                    onFinalize={finalizeQuote}
                  />
                )}
              </div>
            </Card>

            <div className="mt-4 flex items-center justify-between rounded-xl border bg-background p-3 shadow-sm">
              <Button variant="ghost" onClick={goBack} disabled={step === 1 && sub === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div className="hidden text-center text-xs text-muted-foreground sm:block">
                {subCount > 0
                  ? `${STEPS[step - 1].subs?.[sub] || STEPS[step - 1].label} · ${sub + 1} of ${subCount}`
                  : STEPS[step - 1].label}
              </div>
              {step < TOTAL_STEPS || sub < subCount - 1 ? (
                <Button onClick={goNext} disabled={!canProceed}>
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <div className="text-xs font-medium text-emerald-700">
                  All sections available for review
                </div>
              )}
            </div>
          </main>

          {!isFocusMode && (
            <aside className="hidden xl:block">
              <SummarySidebar draft={draft} />
            </aside>
          )}
        </div>
      </div>
      <QuoteViewerDialog quote={savedQuote} open={!!savedQuote} onClose={() => setSavedQuote(null)} />
    </div>
  );
}

function QuoteContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-background px-5 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}

function QuotationNavigator({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <aside className="sticky top-4 hidden overflow-hidden rounded-xl border bg-background shadow-sm xl:block">
      <div className="border-b px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Quotation flow
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.max(4, (step / TOTAL_STEPS) * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Step {step} of {TOTAL_STEPS}
        </div>
      </div>
      <nav className="space-y-1 p-2">
        {FLOW_GROUPS.map((group) => (
          <div key={group.label} className="rounded-lg px-1 py-1.5">
            <div className="px-2 pb-1">
              <div className="text-[11px] font-bold text-foreground">{group.label}</div>
              <div className="text-[9px] leading-4 text-muted-foreground">{group.description}</div>
            </div>
            <div className="space-y-0.5">
              {group.steps.map((stepNumber) => {
                const item = STEPS[stepNumber - 1];
                const done = step > stepNumber;
                const active = step === stepNumber;
                const future = stepNumber > step;
                return (
                  <button
                    key={stepNumber}
                    type="button"
                    onClick={() => {
                      if (future) {
                        toast.info("Complete the current step before moving forward");
                        return;
                      }
                      onJump(stepNumber);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition",
                      active && "bg-primary text-primary-foreground shadow-sm",
                      done && "text-primary hover:bg-primary/5",
                      future && "cursor-not-allowed text-muted-foreground/55",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                        active && "border-primary-foreground/40 bg-primary-foreground/10",
                        done && "border-primary/30 bg-primary/5",
                        future && "border-muted-foreground/20",
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : stepNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {item.label}
                    </span>
                    {item.subs && <span className="text-[9px] opacity-70">{item.subs.length}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

// ============================================================
// Progress bar
// ============================================================
function ProgressBar({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex items-start gap-0 min-w-max py-2">
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          const isFuture = s.n > step;
          const handleClick = () => {
            if (isFuture) {
              toast.info("Complete previous steps first");
              return;
            }
            if (active) {
              window.scrollTo({ top: 0, behavior: "smooth" });
              return;
            }
            onJump(s.n);
          };
          return (
            <div key={s.n} className="flex items-start">
              <button
                type="button"
                onClick={handleClick}
                className={cn(
                  "flex flex-col items-center gap-1 min-w-[68px] group",
                  isFuture ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                    done &&
                      "bg-primary border-primary text-primary-foreground group-hover:brightness-110",
                    active && "bg-accent border-accent text-accent-foreground",
                    !done &&
                      !active &&
                      "bg-background border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : s.n}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-tight text-center",
                    active ? "text-accent" : done ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-[2px] w-4 mt-4",
                    step > s.n ? "bg-primary" : "bg-muted-foreground/20",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Validation — updated step numbers (step 5 = Routing, step 12 = Hotels)
// ============================================================
function validate(d: QuoteDraft, step: number): boolean {
  switch (step) {
    case 1:
      return d.query_type !== null && !!d.linked_query_id;
    case 2:
      if (d.query_type === "B2B") return !!d.agent.agent_id;
      if (d.query_type === "B2C") return !!d.guest.name;
      if (d.query_type === "Brochure") return !!d.brochure.tour_type;
      return false;
    case 3: {
      const paxOk =
        d.query_type === "Brochure"
          ? (d.pax_min ?? 0) >= 1 && (d.pax_max ?? 0) >= (d.pax_min ?? 0)
          : d.adults + d.ss + d.children.length >= 1;
      if (!paxOk) return false;
      if (!d.tour_start_city && !d.departure_city) return false;
      if (!d.tour_end_city) return false;
      if (d.nights < 1) return false;
      if (d.query_type === "Brochure")
        return !!d.brochure_validity_from && !!d.brochure_validity_till;
      if (d.has_dates === false) return true;
      return !!d.start_date;
    }
    case 4:
      return d.program_mode === "existing" ? !!d.program_id : !!d.program_name;
    case 5: {
      // Routing
      const overnightRows = d.routing.filter((r) => r.overnight);
      if (overnightRows.length === 0) return false;
      return overnightRows.some((r) => !!r.city_id);
    }
    case 7: {
      // Accommodation Part — Hotels
      const overnightCities = d.routing
        .filter((r) => r.overnight && r.city_id)
        .map((r) => r.city_id);
      if (overnightCities.length === 0) return true;
      const A = d.hotel_options.find((o) => o.key === "A");
      if (!A) return false;
      return overnightCities.every((cid) => A.selections.some((s) => s.city_id === cid));
    }
    default:
      return true;
  }
}

// ============================================================
// Step router — maps slot → component (renumbered)
// ============================================================
function StepContent({
  draft,
  set,
  sub,
  setSub,
}: {
  draft: QuoteDraft;
  set: (p: Partial<QuoteDraft>) => void;
  sub: number;
  setSub: (n: number) => void;
}) {
  const step = Math.min(draft.step, TOTAL_STEPS);
  const def = STEPS[step - 1];
  const subs = def?.subs;

  const inner = (() => {
    switch (step) {
      case 1:
        return <Step1 draft={draft} set={set} />;
      case 2:
        return <Step2 draft={draft} set={set} />;
      case 3:
        return <StepTripBasics draft={draft} set={set} />;
      case 4:
        return <Step4 draft={draft} set={set} />;
      case 5:
        return <Step9 draft={draft} set={set} />; // Routing
      case 6: {
        // Land Part
        switch (sub) {
          case 0:
            return <Step11 draft={draft} set={set} />; // Activities
          case 1:
            return <Step13 draft={draft} set={set} />; // Guide
          case 2:
            return <Step12 draft={draft} set={set} />; // Entrances
          case 3:
            return <Step14 draft={draft} set={set} />; // Misc
          default:
            return <Step10 draft={draft} set={set} />; // Transport
        }
      }
      case 7: // Accommodation Part
        return sub === 1 ? (
          <StepMeals draft={draft} set={set} />
        ) : (
          <Step15 draft={draft} set={set} />
        );
      case 8:
        return <Step16 draft={draft} set={set} />; // Costing
      case 9:
        return <Step18 draft={draft} set={set} />; // Optional supplements
      case 10:
        return <Step17 draft={draft} set={set} />; // Internal final review
      default:
        return null;
    }
  })();

  if (!subs) return inner;

  const subCounts =
    step === 6
      ? [
          draft.activities.length,
          draft.guides.length,
          draft.entrances.length,
          draft.misc.length,
          draft.transport.length,
        ]
      : step === 7
        ? [
            draft.hotel_options.filter((option) => option.selections.length > 0).length,
            Object.keys(draft.meal_selections ?? {}).length,
          ]
        : [];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 p-2">
        <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {step === 6 ? "Land service sections" : "Accommodation sections"}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:flex lg:flex-wrap">
          {subs.map((label, i) => {
            const active = i === Math.min(sub, subs.length - 1);
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSub(i)}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left transition lg:min-w-[128px]",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-transparent bg-background text-muted-foreground hover:border-primary/20 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    active
                      ? "border-primary-foreground/35 bg-primary-foreground/10"
                      : "border-muted-foreground/20 bg-muted/40",
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-xs font-semibold">{label}</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 min-w-5 justify-center px-1.5 text-[10px]",
                    active && "bg-primary-foreground/15 text-primary-foreground",
                  )}
                >
                  {subCounts[i] || 0}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>
      {inner}
    </div>
  );
}

type StepProps = { draft: QuoteDraft; set: (p: Partial<QuoteDraft>) => void };

// ============================================================
// STEP 1 — Query Type
// ============================================================
function Step1({ draft, set }: StepProps) {
  const queries = useCrmQueries();
  const opts: { key: QueryType; title: string; desc: string; icon: typeof Building2 }[] = [
    { key: "B2B", title: "B2B", desc: "Travel Agent Quotation", icon: Building2 },
    { key: "B2C", title: "B2C", desc: "Direct Guest Quotation", icon: User },
    { key: "Brochure", title: "Brochure", desc: "Group / Package / Event", icon: Users },
  ];
  const linkQuery = (queryId: string) => {
    const query = queries.find((item) => item.query_id === queryId);
    if (!query) return;
    const isB2B = query.customer_type === "B2B Agent" || /b2b|agent|partner/i.test(query.lead_source);
    const start = query.travel_start ? new Date(query.travel_start) : null;
    const end = query.travel_end ? new Date(query.travel_end) : null;
    const nights =
      start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
        ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
        : draft.nights;
    set({
      linked_query_id: query.query_id,
      linked_query_name: query.customer,
      query_type: isB2B ? "B2B" : "B2C",
      agent: isB2B
        ? {
            agent_id: query.agent_id,
            name: query.contact_person,
            agency: query.customer,
            phone: query.mobile,
            email: query.email,
          }
        : draft.agent,
      guest: !isB2B
        ? {
            name: query.contact_person || query.customer,
            phone: query.mobile,
            email: query.email,
            city: query.query_base_city || "",
          }
        : draft.guest,
      home_city: query.query_base_city || draft.home_city,
      start_date: query.travel_start || draft.start_date,
      nights,
      adults: query.adults || query.pax || draft.adults,
      children: Array.from({ length: Math.max(0, query.children || 0) }, () => ({ age: 8 })),
      pax_min: query.min_pax || undefined,
      pax_max: query.max_pax || undefined,
      tour_start_city: query.tour_start_city || draft.tour_start_city,
      tour_end_city: query.tour_end_city || draft.tour_end_city,
      departure_city: query.tour_start_city || draft.departure_city,
      program_mode: query.program_id ? "existing" : draft.program_mode,
      program_id: query.program_id || draft.program_id,
      program_code: query.program_id || draft.program_code,
      program_name: query.program_name || query.destination || draft.program_name,
      traveler_type: query.traveler_type || draft.traveler_type,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/[0.03] p-4">
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <div>
            <div className="text-sm font-semibold">Authoritative Query</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Every generated quotation must belong to one Query.
            </p>
          </div>
          <Select value={draft.linked_query_id || ""} onValueChange={linkQuery}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Select Query number, customer or programme" />
            </SelectTrigger>
            <SelectContent className="max-h-[360px]">
              {queries.map((query) => (
                <SelectItem key={query.query_id} value={query.query_id}>
                  {query.query_id} · {query.customer} · {query.program_name || query.destination || "Programme pending"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Quotation audience
          </div>
          <h2 className="text-lg font-semibold">Select Query Type</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose who this quotation is being prepared for.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          Required to continue
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = draft.query_type === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => set({ query_type: o.key })}
              className={cn(
                "group relative min-h-[190px] overflow-hidden rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                active
                  ? "border-primary bg-primary/[0.06] shadow-sm ring-1 ring-primary/10"
                  : "border-border bg-background hover:border-primary/40",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl border",
                    active
                      ? "border-primary/20 bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 text-primary group-hover:bg-primary/10",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 bg-background",
                  )}
                >
                  {active && <CheckCircle2 className="h-4 w-4" />}
                </span>
              </div>
              <div className="mt-8 text-xl font-bold">{o.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{o.desc}</div>
              <div
                className={cn(
                  "mt-4 text-xs font-semibold",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active ? "Selected for this quotation" : `Select ${o.title}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// STEP 2 — Identification
// ============================================================
function Step2({ draft, set }: StepProps) {
  const agents = useAgents();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  useEffect(() => {
    const id = draft.agent.agent_id;
    if (!id) return;
    const a = agents.find((x) => x.id === id);
    if (!a) return;
    if (
      a.name !== draft.agent.name ||
      a.agency !== draft.agent.agency ||
      a.phone !== draft.agent.phone ||
      a.email !== draft.agent.email
    ) {
      set({
        agent: { agent_id: a.id, name: a.name, agency: a.agency, phone: a.phone, email: a.email },
      });
    }
  }, [agents]);

  const applyAgent = (a: Agent) => {
    set({
      agent: { agent_id: a.id, name: a.name, agency: a.agency, phone: a.phone, email: a.email },
    });
    setEditMode(false);
  };

  if (draft.query_type === "B2B") {
    const selected = draft.agent.agent_id
      ? agents.find((a) => a.id === draft.agent.agent_id)
      : undefined;
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Agent Details</h2>
        <div>
          <Label>Select Agent</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="flex-1 justify-between font-normal"
                >
                  {selected
                    ? `${selected.name} — ${selected.agency}`
                    : draft.agent.name
                      ? `${draft.agent.name}${draft.agent.agency ? " — " + draft.agent.agency : ""}`
                      : "Search agent by name, agency, mobile, email…"}
                  <ChevronRight className="h-4 w-4 opacity-50 rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command
                  filter={(value, search) => {
                    const a = agents.find((x) => x.id === value);
                    if (!a) return 0;
                    const hay = [a.name, a.agency, a.phone, a.email, a.city]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase();
                    return hay.includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Search agents…" />
                  <CommandList>
                    <CommandEmpty>No agents found.</CommandEmpty>
                    <CommandGroup>
                      {agents.map((a) => (
                        <CommandItem
                          key={a.id}
                          value={a.id}
                          onSelect={() => {
                            applyAgent(a);
                            setPickerOpen(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {a.name}{" "}
                              <span className="text-muted-foreground font-normal">
                                — {a.agency}
                              </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {[a.phone, a.email, a.city].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                setEditingAgent(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Register New Agent
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Agent Name</Label>
            <Input
              readOnly={!!selected && !editMode}
              value={draft.agent.name}
              onChange={(e) => set({ agent: { ...draft.agent, name: e.target.value } })}
            />
          </div>
          <div>
            <Label>Agency Name</Label>
            <Input
              readOnly={!!selected && !editMode}
              value={draft.agent.agency}
              onChange={(e) => set({ agent: { ...draft.agent, agency: e.target.value } })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              readOnly={!!selected && !editMode}
              value={draft.agent.phone}
              onChange={(e) => set({ agent: { ...draft.agent, phone: e.target.value } })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              readOnly={!!selected && !editMode}
              value={draft.agent.email}
              onChange={(e) => set({ agent: { ...draft.agent, email: e.target.value } })}
            />
          </div>
        </div>

        {selected && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Fields auto-filled from master.</span>
            {!editMode ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setEditMode(true)}
              >
                Override for this quote
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  if (selected) applyAgent(selected);
                }}
              >
                Reset to master
              </Button>
            )}
          </div>
        )}

        <AgentFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          agent={editingAgent}
          onSaved={(a) => {
            applyAgent(a);
          }}
        />
      </div>
    );
  }
  if (draft.query_type === "B2C") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Guest Details</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Guest Name</Label>
            <Input
              value={draft.guest.name}
              onChange={(e) => set({ guest: { ...draft.guest, name: e.target.value } })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={draft.guest.phone}
              onChange={(e) => set({ guest: { ...draft.guest, phone: e.target.value } })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={draft.guest.email}
              onChange={(e) => set({ guest: { ...draft.guest, email: e.target.value } })}
            />
          </div>
          <div>
            <Label>City (travelling from)</Label>
            <Input
              value={draft.guest.city}
              onChange={(e) => set({ guest: { ...draft.guest, city: e.target.value } })}
            />
          </div>
        </div>
      </div>
    );
  }
  // Brochure
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Brochure / Group Tour Details</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tour Type</Label>
          <Select
            value={draft.brochure.tour_type}
            onValueChange={(v) => set({ brochure: { ...draft.brochure, tour_type: v } })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {["Leisure", "Pilgrimage", "Adventure", "Corporate", "Wedding", "Event"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Purpose / Theme</Label>
          <Input
            value={draft.brochure.theme}
            onChange={(e) => set({ brochure: { ...draft.brochure, theme: e.target.value } })}
          />
        </div>
        <div>
          <Label>Event / Season</Label>
          <Input
            placeholder="e.g. Diwali Special"
            value={draft.brochure.event}
            onChange={(e) => set({ brochure: { ...draft.brochure, event: e.target.value } })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Period From</Label>
            <Input
              type="date"
              value={draft.brochure.period_start}
              onChange={(e) =>
                set({ brochure: { ...draft.brochure, period_start: e.target.value } })
              }
            />
          </div>
          <div>
            <Label>Period To</Label>
            <Input
              type="date"
              value={draft.brochure.period_end}
              onChange={(e) => set({ brochure: { ...draft.brochure, period_end: e.target.value } })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 4 — Program (updated with Program Name & Category)
// ============================================================
// STEP 4 — Program (updated with Program Name & Category and Beautiful Preview)
// ============================================================
function Step4({ draft, set }: StepProps) {
  const programs = usePrograms();
  const db = useDB();
  const [programSearch, setProgramSearch] = useState("");
  const [durationFilter, setDurationFilter] = useState("all");

  const visiblePrograms = useMemo(() => {
    const term = programSearch.trim().toLowerCase();
    return programs.filter((program) => {
      if (program.status === "Archived") return false;
      if (durationFilter !== "all" && program.nights !== Number(durationFilter)) return false;
      if (!term) return true;
      return [program.code, program.name, program.routing_summary, ...program.cities]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [durationFilter, programSearch, programs]);

  // Find the currently selected program for the preview
  const selectedProgram = programs.find((p) => p.id === draft.program_id);

  const applyProgram = (id: string) => {
    const p = programs.find((x) => x.id === id);
    if (!p) return;
    const nameToId = (name: string | null) => {
      if (!name) return "";
      return db.cities.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id || "";
    };
    const sourceRouting = p.routing.length
      ? p.routing
      : Array.from({ length: Math.max(1, p.days) }, (_, index) => ({
          day: index + 1,
          overnight_city: null,
          program_text: index === 0 ? p.routing_summary : "",
        }));
    const routing: RoutingDay[] = sourceRouting.map((r, i) => ({
      day: r.day,
      date: addDaysISO(draft.start_date, i),
      city_id: nameToId(r.overnight_city),
      to_city_id: nameToId(r.destination_city || r.overnight_city),
      to_city_ids: nameToId(r.destination_city || r.overnight_city)
        ? [nameToId(r.destination_city || r.overnight_city)]
        : [],
      from_city: r.from_city || (i === 0 ? p.departure_city || draft.tour_start_city : undefined),
      to_city: r.destination_city || r.overnight_city || "",
      day_name: r.program_text || undefined,
      program: r.program_text,
      program_mode: "text",
      overnight: !!r.overnight_city,
    }));
    writeDraft({
      ...draft,
      program_id: p.id,
      program_code: p.code,
      program_name: p.name,
      program_mode: "existing",
      save_program_as_new: false,
      new_program_code: "",
      new_program_name: "",
      nights: p.nights,
      categories: p.categories?.length ? p.categories : draft.categories,
      departure_city: p.departure_city || draft.departure_city,
      travel_modes: p.travel_modes?.length ? p.travel_modes : draft.travel_modes,
      routing,
      inclusions: p.inclusions?.length ? p.inclusions : draft.inclusions,
      exclusions: p.exclusions?.length ? p.exclusions : draft.exclusions,
    });
    toast.success(`Auto-filled from "${p.name}" — all fields remain editable.`);
  };

  const toggleCategory = (tag: string) => {
    const has = draft.categories.includes(tag);
    set({
      categories: has ? draft.categories.filter((x) => x !== tag) : [...draft.categories, tag],
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Program Selection</h2>

      <RadioGroup
        value={draft.program_mode}
        onValueChange={(v) => set({ program_mode: v as "existing" | "new" })}
      >
        {/* ---- Existing Program ---- */}
        <div className="flex items-start gap-3 p-4 border rounded-lg relative">
          <RadioGroupItem value="existing" id="pm-e" className="mt-1" />
          <div className="flex-1">
            <label htmlFor="pm-e" className="font-medium cursor-pointer">
              Pre-Select Existing Program
            </label>
            {draft.program_mode === "existing" && (
              <div className="mt-2 space-y-4">
                <div className="grid gap-2 md:grid-cols-[1fr_220px]">
                  <Input
                    value={programSearch}
                    onChange={(event) => setProgramSearch(event.target.value)}
                    placeholder="Search name, code, routing or city…"
                  />
                  <Select value={durationFilter} onValueChange={setDurationFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All durations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All durations</SelectItem>
                      {Array.from(new Set(programs.map((program) => program.nights)))
                        .sort((a, b) => a - b)
                        .map((nights) => (
                          <SelectItem key={nights} value={String(nights)}>
                            {nights} Nights / {nights + 1} Days
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select value={draft.program_id || ""} onValueChange={applyProgram}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose program…" />
                  </SelectTrigger>
                  <SelectContent>
                    {visiblePrograms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} · {p.name} · {p.nights}N/{p.days}D ·{" "}
                        {p.routing_summary || "Routing to be completed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {visiblePrograms.length} matching programs. Search accepts route abbreviations and
                  full city names.
                </p>

                {/* 🔥 ATTRACTIVE & BEAUTIFUL PROGRAM PREVIEW */}
                {selectedProgram && (
                  <Card className="border-accent/20 shadow-md overflow-hidden mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-4 border-b bg-muted/5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-lg text-accent-foreground">
                          {selectedProgram.name}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="font-mono font-medium">{selectedProgram.code}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {selectedProgram.nights} Nights
                          </span>
                          {selectedProgram.departure_city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> Ex-{selectedProgram.departure_city}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedProgram.categories?.map((cat) => (
                          <Badge
                            key={cat}
                            variant="secondary"
                            className="text-[10px] bg-accent/10 text-accent border-accent/20"
                          >
                            {cat}
                          </Badge>
                        ))}
                        {selectedProgram.travel_modes?.map((mode) => (
                          <Badge
                            key={mode}
                            variant="outline"
                            className="text-[10px] capitalize bg-background"
                          >
                            {mode === "flight"
                              ? "✈ Flight"
                              : mode === "train"
                                ? "🚂 Train"
                                : mode === "car"
                                  ? "🚗 Car"
                                  : mode}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {selectedProgram.routing_summary && (
                      <div className="border-b bg-primary/5 px-4 py-3 text-sm">
                        <span className="font-medium">Routing:</span>{" "}
                        {selectedProgram.routing_summary}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                      {/* Itinerary */}
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" /> Day-by-Day Itinerary
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                          {selectedProgram.routing?.map((r, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 text-xs pb-1.5 border-b border-muted/30 last:border-0"
                            >
                              <div className="font-mono font-bold text-muted-foreground w-12 shrink-0 pt-0.5">
                                Day {r.day}
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-foreground truncate">
                                  {r.overnight_city || "Travel / Transfer"}
                                </div>
                                <div className="text-[10px] text-muted-foreground line-clamp-1">
                                  {r.program_text || "—"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Inclusions & Exclusions */}
                      <div className="space-y-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1 flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Inclusions
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5 list-none pl-0">
                            {(selectedProgram.inclusions?.length ?? 0) > 0 ? (
                              selectedProgram.inclusions?.map((inc, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                                  <span>{inc}</span>
                                </li>
                              ))
                            ) : (
                              <li className="italic">No specific inclusions listed.</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1 flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-destructive" /> Exclusions
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5 list-none pl-0">
                            {(selectedProgram.exclusions?.length ?? 0) > 0 ? (
                              selectedProgram.exclusions?.map((exc, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <XCircle className="h-3 w-3 mt-0.5 shrink-0 text-destructive" />
                                  <span>{exc}</span>
                                </li>
                              ))
                            ) : (
                              <li className="italic">No specific exclusions listed.</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {selectedProgram && (
                  <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={!!draft.save_program_as_new}
                        onCheckedChange={(checked) => set({
                          save_program_as_new: checked === true,
                          new_program_name: checked === true
                            ? draft.new_program_name || `${draft.program_name} — Customized`
                            : draft.new_program_name,
                        })}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          Save the customized routing as a new Program
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          The selected master remains unchanged. The working itinerary always stays with this quotation.
                        </span>
                      </span>
                    </label>
                    {draft.save_program_as_new && (
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
                        <div>
                          <Label>New Program Name</Label>
                          <Input
                            value={draft.new_program_name || ""}
                            onChange={(event) => set({ new_program_name: event.target.value })}
                            placeholder="Name the customized program"
                          />
                        </div>
                        <div>
                          <Label>New Program Code</Label>
                          <Input
                            value={draft.new_program_code || ""}
                            onChange={(event) => set({ new_program_code: event.target.value.toUpperCase() })}
                            placeholder="Auto-generated"
                            className="font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---- New Custom Program ---- */}
        <div className="flex items-start gap-3 p-4 border rounded-lg">
          <RadioGroupItem value="new" id="pm-n" className="mt-1" />
          <div className="flex-1">
            <label htmlFor="pm-n" className="font-medium cursor-pointer">
              New Routing / Customized
            </label>
            {draft.program_mode === "new" && (
              <div className="mt-2 space-y-4">
                <div>
                  <Label>
                    Program Code{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    placeholder="Auto-generated when quotation is saved"
                    value={draft.program_code || ""}
                    onChange={(e) =>
                      set({ program_code: e.target.value.toUpperCase(), program_id: undefined })
                    }
                    className="mt-1 font-mono"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank for the next MPCUS code, or enter an approved internal code.
                  </p>
                </div>
                <div>
                  <Label>Program Name</Label>
                  <Input
                    placeholder="e.g. Bhopal-Sanchi-Bhimbetka Heritage Tour"
                    value={draft.program_name}
                    onChange={(e) => set({ program_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Program Category</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {CATEGORY_TAGS.map((tag) => {
                      const on = draft.categories.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleCategory(tag)}
                          className={cn(
                            "px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors",
                            on
                              ? "bg-accent text-accent-foreground border-accent"
                              : "bg-background border-border hover:border-primary/40",
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select one or more categories that best describe the tour.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </RadioGroup>
    </div>
  );
}

// ============================================================
// STEP 5 — Routing (was Step9) – unchanged, but included here
// ============================================================
function Step9({ draft, set }: StepProps) {
  const d = useDB();
  useEffect(() => {
    const need = draft.nights + 1;
    if (draft.routing.length !== need) {
      const rows: RoutingDay[] = [];
      for (let i = 0; i < need; i++) {
        const existing = draft.routing[i];
        rows.push(
          existing || {
            day: i + 1,
            date: addDaysISO(draft.start_date, i),
            city_id: "",
            program: "",
            program_mode: "text",
            overnight: i < need - 1,
          },
        );
        rows[i].day = i + 1;
        rows[i].date = addDaysISO(draft.start_date, i);
        rows[i].overnight = i < need - 1;
      }
      if (rows[0] && !rows[0].from_city) {
        rows[0].from_city = draft.tour_start_city || draft.departure_city;
      }
      const last = rows[rows.length - 1];
      if (last && draft.tour_end_city && !last.to_city) {
        const ending = d.cities.find(
          (city) => city.name.toLowerCase() === draft.tour_end_city?.toLowerCase(),
        );
        last.to_city = draft.tour_end_city;
        if (ending) {
          last.to_city_id = ending.id;
          last.to_city_ids = [ending.id];
          last.city_id = ending.id;
        }
      }
      writeDraft({ ...draft, routing: rows });
    }
  }, [draft.nights, draft.start_date, draft.tour_start_city, draft.tour_end_city]);

  const updateRow = (i: number, patch: Partial<RoutingDay>) => {
    const next = [...draft.routing];
    next[i] = { ...next[i], ...patch };
    set({ routing: next });
  };

  const OVERNIGHT_NONE = "__none__";
  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Day-by-Day Routing</h2>
      <div className="border border-[#E5E7EB] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px] border-collapse">
          <thead className="bg-[#F3F4F6] text-[11px] uppercase text-muted-foreground tracking-wide">
            <tr className="border-b border-[#E5E7EB]">
              <th className="text-left p-2 w-[50px]">Day</th>
              <th className="text-left p-2 w-[65px]">Day Name</th>
              <th className="text-left p-2 w-[90px]">Date</th>
              <th className="text-left p-2 w-[80px]">From</th>
              <th className="text-left p-2 w-[200px]">To</th>
              <th className="text-left p-2 w-[120px]">Overnight</th>
              <th className="text-left p-2 w-[110px]">Travel By</th>
              <th className="text-left p-2 w-[200px]">Tour Title</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, i) => {
              const isLast = i === draft.routing.length - 1;
              const fromDefault =
                i === 0
                  ? draft.tour_start_city || draft.departure_city
                  : cityName(draft.routing[i - 1]?.city_id || "") ||
                    draft.routing[i - 1]?.to_city ||
                    "";
              const weekday =
                draft.has_dates !== false && r.date
                  ? new Date(r.date).toLocaleDateString("en-US", { weekday: "long" })
                  : `Day ${r.day}`;
              return (
                <React.Fragment key={i}>
                  <tr
                    className="bg-white border-b border-[#E5E7EB] align-middle"
                    style={{ minHeight: 56 }}
                  >
                    <td className="p-2 font-semibold align-middle">Day {r.day}</td>
                    <td className="p-2 align-middle">
                      <Input
                        className="h-8 text-xs"
                        value={r.day_name || weekday}
                        onChange={(e) => updateRow(i, { day_name: e.target.value })}
                      />
                    </td>
                    <td className="p-2 text-xs align-middle">
                      {draft.has_dates === false ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        fmtDateShort(r.date)
                      )}
                    </td>
                    <td className="p-2 text-xs align-middle">
                      {(() => {
                        const currentName = r.from_city ?? fromDefault;
                        const currentId = d.cities.find((c) => c.name === currentName)?.id || "";
                        return (
                          <Select
                            value={currentId || "__custom__"}
                            onValueChange={(v) => {
                              if (v === "__custom__") return;
                              const nm = d.cities.find((c) => c.id === v)?.name || "";
                              updateRow(i, { from_city: nm });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={currentName || "From city…"}>
                                {currentName || "Select"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {d.cities.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </td>

                    <td className="p-2 align-middle w-[200px]">
                      {(() => {
                        const selected =
                          r.to_city_ids && r.to_city_ids.length > 0
                            ? r.to_city_ids
                            : r.to_city_id
                              ? [r.to_city_id]
                              : [];
                        const available = d.cities.filter((c) => !selected.includes(c.id));
                        const addCity = (v: string) => {
                          const next = Array.from(new Set([...selected, v]));
                          const primary = next[0];
                          const shouldMirror =
                            !r.city_id || r.city_id === r.to_city_id || selected.length === 0;
                          updateRow(i, {
                            to_city_ids: next,
                            to_city_id: primary,
                            to_city: cityName(primary),
                            ...(isLast
                              ? { city_id: primary }
                              : shouldMirror
                                ? { city_id: primary }
                                : {}),
                          });
                        };
                        const removeCity = (id: string) => {
                          const next = selected.filter((x) => x !== id);
                          const primary = next[0] || "";
                          updateRow(i, {
                            to_city_ids: next,
                            to_city_id: primary,
                            to_city: cityName(primary),
                            ...(isLast ? { city_id: primary } : {}),
                          });
                        };
                        return (
                          <>
                            {selected.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {selected.map((id) => (
                                  <span
                                    key={id}
                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30"
                                  >
                                    {cityName(id) || id}
                                    <button
                                      type="button"
                                      onClick={() => removeCity(id)}
                                      className="hover:text-destructive"
                                      title="Remove"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <Select value="" onValueChange={addCity}>
                              <SelectTrigger className="h-8">
                                <SelectValue
                                  placeholder={
                                    selected.length === 0
                                      ? isLast
                                        ? "Departure city…"
                                        : "Add destination…"
                                      : "+ Add another destination"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {available.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isLast && selected.length === 0 && (
                              <Input
                                className="h-7 text-[11px] mt-1"
                                placeholder="or type departure city"
                                value={r.to_city && !r.to_city_id ? r.to_city : ""}
                                onChange={(e) => updateRow(i, { to_city: e.target.value })}
                              />
                            )}
                          </>
                        );
                      })()}
                    </td>

                    <td className="p-2 align-middle w-[120px]">
                      {isLast ? (
                        <span className="text-[11px] text-muted-foreground italic">Departure</span>
                      ) : (
                        <Select
                          value={r.city_id || OVERNIGHT_NONE}
                          onValueChange={(v) =>
                            updateRow(i, { city_id: v === OVERNIGHT_NONE ? "" : v })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Stay city…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={OVERNIGHT_NONE}>— None —</SelectItem>
                            {d.cities.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="p-2 align-middle w-[110px]">
                      <div className="flex gap-1">
                        <Select
                          value={r.travel_by || ""}
                          onValueChange={(v) =>
                            updateRow(i, {
                              travel_by: v as RoutingDay["travel_by"],
                              transport_expanded: true,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Road">Road</SelectItem>
                            <SelectItem value="Train">Train</SelectItem>
                            <SelectItem value="Flight">Flight</SelectItem>
                            <SelectItem value="Bus">Bus</SelectItem>
                            <SelectItem value="Self Drive">Self Drive</SelectItem>
                            <SelectItem value="Helicopter">Helicopter</SelectItem>
                            <SelectItem value="Boat">Boat</SelectItem>
                            <SelectItem value="Walk">Walk</SelectItem>
                            <SelectItem value="Custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        {r.travel_by && (
                          <button
                            type="button"
                            title={r.transport_expanded ? "Hide details" : "Show details"}
                            onClick={() =>
                              updateRow(i, { transport_expanded: !r.transport_expanded })
                            }
                            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md border hover:bg-muted"
                          >
                            {r.transport_expanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-2 align-middle w-[240px]">
                      {(() => {
                        const toIds =
                          r.to_city_ids && r.to_city_ids.length > 0
                            ? r.to_city_ids
                            : r.to_city_id
                              ? [r.to_city_id]
                              : [];
                        const fromName = r.from_city ?? fromDefault;
                        const fromId = d.cities.find((c) => c.name === fromName)?.id || "";
                        const allIds: string[] = [];
                        if (fromId) allIds.push(fromId);
                        toIds.forEach((id) => {
                          if (id && !allIds.includes(id)) allIds.push(id);
                        });
                        if (r.city_id && !allIds.includes(r.city_id)) allIds.push(r.city_id);
                        const getTourOptionsForCity = (routingCityId: string) => {
                          if (!routingCityId) return [] as Array<{ id: string; title: string }>;
                          const cityNameRaw =
                            d.cities.find((c) => c.id === routingCityId)?.name ?? "";
                          const normalized = cityNameRaw.trim().toLowerCase();
                          if (!normalized) return [] as Array<{ id: string; title: string }>;
                          const destCity = d.destination_cities.find(
                            (c) => c.name.trim().toLowerCase() === normalized,
                          );
                          if (!destCity) return [] as Array<{ id: string; title: string }>;
                          return [...d.destination_tours]
                            .filter((tour) => tour.city_id === destCity.id)
                            .sort((a, b) => a.title.localeCompare(b.title));
                        };
                        const selectedMap = r.tours_selected_by_city || {};
                        const toggle = (cid: string, title: string) => {
                          const list = selectedMap[cid] || [];
                          const next = list.includes(title)
                            ? list.filter((t) => t !== title)
                            : [...list, title];
                          updateRow(i, {
                            tours_selected_by_city: { ...selectedMap, [cid]: next },
                          });
                        };
                        if (allIds.length === 0) {
                          return (
                            <span className="text-[11px] text-muted-foreground italic">
                              Set FROM/TO first
                            </span>
                          );
                        }
                        return (
                          <div className="flex flex-col gap-1">
                            {allIds.map((cid) => {
                              const cityTours = getTourOptionsForCity(cid);
                              const selected = selectedMap[cid] || [];
                              const nm = cityName(cid) || cid;
                              return (
                                <Popover key={cid}>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="h-7 w-full flex items-center gap-1.5 text-[11px] px-2 border rounded hover:bg-muted text-left"
                                    >
                                      <span
                                        className="text-muted-foreground truncate w-[64px]"
                                        title={nm}
                                      >
                                        {nm}
                                      </span>
                                      <span className="flex-1 truncate">
                                        {selected.length === 0
                                          ? cityTours.length
                                            ? "Select tours…"
                                            : "No tours"
                                          : `${selected.length} tour${selected.length === 1 ? "" : "s"}`}
                                      </span>
                                      <ChevronDown className="h-3 w-3 shrink-0" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    align="start"
                                    className="w-72 p-2 max-h-72 overflow-auto"
                                  >
                                    {cityTours.length === 0 ? (
                                      <div className="text-xs text-muted-foreground p-2">
                                        No tours defined for {nm}.
                                      </div>
                                    ) : (
                                      cityTours.map((tour) => (
                                        <label
                                          key={tour.id}
                                          className="flex items-start gap-2 py-1 px-1 rounded hover:bg-muted cursor-pointer text-xs"
                                        >
                                          <Checkbox
                                            checked={selected.includes(tour.title)}
                                            onCheckedChange={() => toggle(cid, tour.title)}
                                            className="mt-0.5"
                                          />
                                          <span className="flex-1">{tour.title}</span>
                                        </label>
                                      ))
                                    )}
                                  </PopoverContent>
                                </Popover>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>

                  {r.travel_by && r.transport_expanded && (
                    <tr key={`${i}-details`} className="border-b border-[#E5E7EB] bg-muted/20">
                      <td colSpan={8} className="p-3">
                        <DayTransportPanel
                          mode={r.travel_by}
                          details={r.transport_details || {}}
                          onChange={(patch) =>
                            updateRow(i, {
                              transport_details: { ...(r.transport_details || {}), ...patch },
                            })
                          }
                          defaultFrom={r.from_city ?? fromDefault}
                          defaultTo={cityName(r.to_city_id || r.city_id) || r.to_city || ""}
                          defaultDate={r.date}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Per-day transport details panel – unchanged
function DayTransportPanel({
  mode,
  details,
  onChange,
  defaultFrom,
  defaultTo,
  defaultDate,
}: {
  mode: NonNullable<RoutingDay["travel_by"]>;
  details: NonNullable<RoutingDay["transport_details"]>;
  onChange: (patch: Partial<NonNullable<RoutingDay["transport_details"]>>) => void;
  defaultFrom?: string;
  defaultTo?: string;
  defaultDate?: string;
}) {
  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
  const cls = "h-8 text-xs";

  if (mode === "Flight") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <F label="Flight Class">
          <Input
            className={cls}
            value={details.flight_class || ""}
            onChange={(e) => onChange({ flight_class: e.target.value })}
            placeholder="Economy / Business"
          />
        </F>
        <F label="Airline">
          <Input
            className={cls}
            value={details.airline || ""}
            onChange={(e) => onChange({ airline: e.target.value })}
            placeholder="IndiGo"
          />
        </F>
        <F label="Flight Number">
          <Input
            className={cls}
            value={details.flight_number || ""}
            onChange={(e) => onChange({ flight_number: e.target.value })}
            placeholder="6E-214"
          />
        </F>
        <F label="PNR / Ref">
          <Input
            className={cls}
            value={details.remarks || ""}
            onChange={(e) => onChange({ remarks: e.target.value })}
            placeholder="Optional"
          />
        </F>
        <F label="From City">
          <Input
            className={cls}
            value={details.from_city ?? defaultFrom ?? ""}
            onChange={(e) => onChange({ from_city: e.target.value })}
          />
        </F>
        <F label="To City">
          <Input
            className={cls}
            value={details.to_city ?? defaultTo ?? ""}
            onChange={(e) => onChange({ to_city: e.target.value })}
          />
        </F>
        <F label="Departure Date">
          <Input
            type="date"
            className={cls}
            value={details.departure_date ?? defaultDate ?? ""}
            onChange={(e) => onChange({ departure_date: e.target.value })}
          />
        </F>
        <F label="Departure Time">
          <Input
            type="time"
            className={cls}
            value={details.departure_time || ""}
            onChange={(e) => onChange({ departure_time: e.target.value })}
          />
        </F>
        <F label="Arrival Date">
          <Input
            type="date"
            className={cls}
            value={details.arrival_date ?? defaultDate ?? ""}
            onChange={(e) => onChange({ arrival_date: e.target.value })}
          />
        </F>
        <F label="Arrival Time">
          <Input
            type="time"
            className={cls}
            value={details.arrival_time || ""}
            onChange={(e) => onChange({ arrival_time: e.target.value })}
          />
        </F>
      </div>
    );
  }

  if (mode === "Train") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <F label="Train Name">
          <Input
            className={cls}
            value={details.train_name || ""}
            onChange={(e) => onChange({ train_name: e.target.value })}
            placeholder="Vande Bharat"
          />
        </F>
        <F label="Train Number">
          <Input
            className={cls}
            value={details.train_number || ""}
            onChange={(e) => onChange({ train_number: e.target.value })}
            placeholder="20171"
          />
        </F>
        <F label="Coach / Class">
          <Input
            className={cls}
            value={details.coach_class || ""}
            onChange={(e) => onChange({ coach_class: e.target.value })}
            placeholder="CC / 3A / SL"
          />
        </F>
        <F label="Remarks">
          <Input
            className={cls}
            value={details.remarks || ""}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        </F>
        <F label="Boarding Station">
          <Input
            className={cls}
            value={details.boarding_station ?? defaultFrom ?? ""}
            onChange={(e) => onChange({ boarding_station: e.target.value })}
          />
        </F>
        <F label="Destination Station">
          <Input
            className={cls}
            value={details.destination_station ?? defaultTo ?? ""}
            onChange={(e) => onChange({ destination_station: e.target.value })}
          />
        </F>
        <F label="Departure Date">
          <Input
            type="date"
            className={cls}
            value={details.departure_date ?? defaultDate ?? ""}
            onChange={(e) => onChange({ departure_date: e.target.value })}
          />
        </F>
        <F label="Departure Time">
          <Input
            type="time"
            className={cls}
            value={details.departure_time || ""}
            onChange={(e) => onChange({ departure_time: e.target.value })}
          />
        </F>
        <F label="Arrival Date">
          <Input
            type="date"
            className={cls}
            value={details.arrival_date ?? defaultDate ?? ""}
            onChange={(e) => onChange({ arrival_date: e.target.value })}
          />
        </F>
        <F label="Arrival Time">
          <Input
            type="time"
            className={cls}
            value={details.arrival_time || ""}
            onChange={(e) => onChange({ arrival_time: e.target.value })}
          />
        </F>
        <F label="Overnight Train">
          <div className="flex h-8 items-center gap-2">
            <Switch
              checked={!!details.is_overnight}
              onCheckedChange={(checked) => onChange({ is_overnight: checked })}
            />
            <span className="text-xs text-muted-foreground">
              {details.is_overnight ? "Arrives next day" : "Same-day journey"}
            </span>
          </div>
        </F>
      </div>
    );
  }

  if (mode === "Bus") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <F label="Bus / Operator">
          <Input
            className={cls}
            value={details.bus_name || ""}
            onChange={(e) => onChange({ bus_name: e.target.value })}
            placeholder="Operator or bus name"
          />
        </F>
        <F label="Bus Number">
          <Input
            className={cls}
            value={details.bus_number || ""}
            onChange={(e) => onChange({ bus_number: e.target.value })}
          />
        </F>
        <F label="From">
          <Input
            className={cls}
            value={details.from_city ?? defaultFrom ?? ""}
            onChange={(e) => onChange({ from_city: e.target.value })}
          />
        </F>
        <F label="To">
          <Input
            className={cls}
            value={details.to_city ?? defaultTo ?? ""}
            onChange={(e) => onChange({ to_city: e.target.value })}
          />
        </F>
        <F label="Departure Date">
          <Input
            type="date"
            className={cls}
            value={details.departure_date ?? defaultDate ?? ""}
            onChange={(e) => onChange({ departure_date: e.target.value })}
          />
        </F>
        <F label="Departure Time">
          <Input
            type="time"
            className={cls}
            value={details.departure_time || ""}
            onChange={(e) => onChange({ departure_time: e.target.value })}
          />
        </F>
        <F label="Arrival Date">
          <Input
            type="date"
            className={cls}
            value={details.arrival_date ?? defaultDate ?? ""}
            onChange={(e) => onChange({ arrival_date: e.target.value })}
          />
        </F>
        <F label="Arrival Time">
          <Input
            type="time"
            className={cls}
            value={details.arrival_time || ""}
            onChange={(e) => onChange({ arrival_time: e.target.value })}
          />
        </F>
        <F label="Overnight Bus">
          <div className="flex h-8 items-center gap-2">
            <Switch
              checked={!!details.is_overnight}
              onCheckedChange={(checked) => onChange({ is_overnight: checked })}
            />
            <span className="text-xs text-muted-foreground">
              {details.is_overnight ? "Arrives next day" : "Same-day journey"}
            </span>
          </div>
        </F>
        <div className="md:col-span-3">
          <F label="Remarks">
            <Input
              className={cls}
              value={details.remarks || ""}
              onChange={(e) => onChange({ remarks: e.target.value })}
            />
          </F>
        </div>
      </div>
    );
  }

  if (mode === "Road") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <F label="Vehicle Type">
          <Input
            className={cls}
            value={details.vehicle_type || ""}
            onChange={(e) => onChange({ vehicle_type: e.target.value })}
            placeholder="Tempo Traveller"
          />
        </F>
        <F label="Vehicle Name / Model">
          <Input
            className={cls}
            value={details.vehicle_name || ""}
            onChange={(e) => onChange({ vehicle_name: e.target.value })}
            placeholder="Innova Crysta"
          />
        </F>
        <F label="Reporting Time">
          <Input
            type="time"
            className={cls}
            value={details.reporting_time || ""}
            onChange={(e) => onChange({ reporting_time: e.target.value })}
          />
        </F>
        <F label="Pickup City">
          <Input
            className={cls}
            value={details.pickup_city ?? defaultFrom ?? ""}
            onChange={(e) => onChange({ pickup_city: e.target.value })}
          />
        </F>
        <F label="Drop City">
          <Input
            className={cls}
            value={details.drop_city ?? defaultTo ?? ""}
            onChange={(e) => onChange({ drop_city: e.target.value })}
          />
        </F>
        <F label="Distance (km)">
          <Input
            type="number"
            min={0}
            className={cls}
            value={details.distance_km || ""}
            onChange={(e) => onChange({ distance_km: Number(e.target.value) || 0 })}
          />
        </F>
        <F label="Estimated Travel Time">
          <Input
            className={cls}
            value={details.travel_time || ""}
            onChange={(e) => onChange({ travel_time: e.target.value })}
            placeholder="e.g. 3 hr 30 min"
          />
        </F>
        <F label="Remarks">
          <Input
            className={cls}
            value={details.remarks || ""}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        </F>
      </div>
    );
  }

  if (mode === "Self Drive") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <F label="Vehicle Category">
          <Input
            className={cls}
            value={details.vehicle_category || ""}
            onChange={(e) => onChange({ vehicle_category: e.target.value })}
            placeholder="SUV / Hatchback"
          />
        </F>
        <F label="Pickup Location">
          <Input
            className={cls}
            value={details.pickup_location ?? defaultFrom ?? ""}
            onChange={(e) => onChange({ pickup_location: e.target.value })}
          />
        </F>
        <F label="Drop Location">
          <Input
            className={cls}
            value={details.drop_location ?? defaultTo ?? ""}
            onChange={(e) => onChange({ drop_location: e.target.value })}
          />
        </F>
        <F label="Distance (km)">
          <Input
            type="number"
            min={0}
            className={cls}
            value={details.distance_km || ""}
            onChange={(e) => onChange({ distance_km: Number(e.target.value) || 0 })}
          />
        </F>
        <F label="Estimated Travel Time">
          <Input
            className={cls}
            value={details.travel_time || ""}
            onChange={(e) => onChange({ travel_time: e.target.value })}
            placeholder="e.g. 3 hr 30 min"
          />
        </F>
        <F label="Pickup Time">
          <Input
            type="time"
            className={cls}
            value={details.pickup_time || ""}
            onChange={(e) => onChange({ pickup_time: e.target.value })}
          />
        </F>
        <F label="Return Time">
          <Input
            type="time"
            className={cls}
            value={details.return_time || ""}
            onChange={(e) => onChange({ return_time: e.target.value })}
          />
        </F>
        <F label="Remarks">
          <Input
            className={cls}
            value={details.remarks || ""}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        </F>
      </div>
    );
  }

  // Helicopter / Boat / Walk / Custom
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <F label="From">
        <Input
          className={cls}
          value={details.from_city ?? defaultFrom ?? ""}
          onChange={(e) => onChange({ from_city: e.target.value })}
        />
      </F>
      <F label="To">
        <Input
          className={cls}
          value={details.to_city ?? defaultTo ?? ""}
          onChange={(e) => onChange({ to_city: e.target.value })}
        />
      </F>
      <F label="Departure Time">
        <Input
          type="time"
          className={cls}
          value={details.departure_time || ""}
          onChange={(e) => onChange({ departure_time: e.target.value })}
        />
      </F>
      <F label="Arrival Time">
        <Input
          type="time"
          className={cls}
          value={details.arrival_time || ""}
          onChange={(e) => onChange({ arrival_time: e.target.value })}
        />
      </F>
      <div className="md:col-span-4">
        <F label="Remarks">
          <Input
            className={cls}
            value={details.remarks || ""}
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        </F>
      </div>
    </div>
  );
}

// ============================================================
// STEP 6–15 are imported from separate files; we include them here
// (already imported as Step10, Step11, etc.)
// ============================================================

// ============================================================
// STEP 18 — Optional supplements
// ============================================================
function Step18({ draft, set }: StepProps) {
  const d = useDB();
  const land = buildLandPart(draft, d);
  const pricingPax = Math.max(1, effectivePaxForPricing(draft));

  const routingCities = new Set(
    draft.routing
      .map((r) => d.cities.find((c) => c.id === (r.to_city_id || r.city_id))?.name)
      .filter(Boolean) as string[],
  );
  const suggActs = d.activities.filter((a) => {
    if (!a.is_active) return false;
    if (draft.activities.some((x) => x.activity_id === a.id)) return false;
    const dest = d.activity_destinations.find((x) => x.id === a.destination_id)?.name;
    return dest && routingCities.has(dest);
  });
  const activitySupplements = Array.from(
    land.rows.reduce((map, row) => {
      row.activity_opts.filter((item) => !item.checked).forEach((item) => {
        const current = map.get(item.id) ?? { id: item.id, name: item.label, rate: 0 };
        current.rate += item.amount;
        map.set(item.id, current);
      });
      return map;
    }, new Map<string, { id: string; name: string; rate: number }>()),
  ).map(([, item]) => item);
  const miscSupplements = Array.from(
    land.rows.reduce((map, row) => {
      row.misc_opts.filter((item) => !item.checked).forEach((item) => {
        const current = map.get(item.id) ?? { id: item.id, name: item.label, rate: 0 };
        current.rate += item.amount;
        map.set(item.id, current);
      });
      return map;
    }, new Map<string, { id: string; name: string; rate: number }>()),
  ).map(([, item]) => item);
  // Guide alternatives are consolidated by language/service, never shown as a
  // tour-by-tour dump. This also avoids adding English + Hindi + Language as
  // one misleading combined price.
  const guideSupplements = Array.from(
    land.rows.reduce((map, row) => {
      row.guide_opts.filter((item) => !item.checked).forEach((item) => {
        const current = map.get(item.label) ?? { name: `${item.label} guide charges`, rate: 0 };
        current.rate += item.amount;
        map.set(item.label, current);
      });
      return map;
    }, new Map<string, { name: string; rate: number }>()),
  ).map(([, item]) => item);
  const entranceTotal = land.rows.reduce(
    (sum, row) => sum + row.entrance_opts
      .filter((item) => !item.checked)
      .reduce((itemSum, item) => itemSum + item.amount, 0),
    0,
  );
  const calculatedSupplements = [
    ...guideSupplements.map((item) => ({ ...item, note: "Combined across the applicable itinerary days" })),
    ...(entranceTotal > 0 ? [{
      name: "Monument entrance charges",
      rate: entranceTotal,
      note: "Combined entrance total for the selected traveller category",
    }] : []),
  ];
  const hasOptional = (name: string, activityId?: string) =>
    draft.optionals.some((line) => (
      (activityId && line.activity_id === activityId)
      || line.custom_name?.toLowerCase() === name.toLowerCase()
    ));
  const addOptional = (name: string, rate: number, activityId?: string) => {
    if (!rate || hasOptional(name, activityId)) return;
    set({
      optionals: [
        ...draft.optionals,
        { id: uid(), custom_name: name, activity_id: activityId, qty: 1, rate },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Optional Add-Ons</h2>
      <p className="text-sm text-muted-foreground">
        Choose only the supplements that should appear outside the package price.
      </p>

      <Card className="p-4">
        <div className="section-label mb-2">Activities excluded from the package</div>
        {activitySupplements.length === 0 ? (
          <p className="text-xs text-muted-foreground">No selected activity was excluded in Step 8.</p>
        ) : (
          <ul className="space-y-2">
            {activitySupplements.map((item) => {
              const source = draft.activities.find((line) => line.id === item.id);
              return <li key={item.id} className="flex justify-between items-center gap-3 text-sm">
                <span>{item.name} · {inr(item.rate)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={hasOptional(item.name, source?.activity_id)}
                  onClick={() => addOptional(item.name, item.rate, source?.activity_id)}
                >
                  {hasOptional(item.name, source?.activity_id) ? "Selected" : "Add optional"}
                </Button>
              </li>;
            })}
          </ul>
        )}
      </Card>

      {(miscSupplements.length > 0 || suggActs.length > 0) && (
        <Card className="p-4 space-y-4">
          {miscSupplements.length > 0 && <div>
            <div className="section-label mb-2">Miscellaneous services excluded from the package</div>
            <ul className="space-y-2">
              {miscSupplements.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{item.name} · {inr(item.rate)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={hasOptional(item.name)}
                    onClick={() => addOptional(item.name, item.rate)}
                  >
                    {hasOptional(item.name) ? "Selected" : "Add optional"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>}
          {suggActs.length > 0 && <div>
            <div className="section-label mb-2">Other itinerary activity suggestions</div>
            <ul className="space-y-2">
              {suggActs.map((activity) => {
                const rate = activityRateForPax(activity, pricingPax);
                return <li key={activity.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{activity.activity_name} · {inr(rate)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={hasOptional(activity.activity_name, activity.id)}
                    onClick={() => addOptional(activity.activity_name, rate, activity.id)}
                  >
                    {hasOptional(activity.activity_name, activity.id) ? "Selected" : "Add optional"}
                  </Button>
                </li>;
              })}
            </ul>
          </div>}
        </Card>
      )}

      <Card className="p-4">
        <div className="section-label mb-3">Calculated Service Supplements</div>
        {calculatedSupplements.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            All calculated guide and entrance services are already included in the package.
          </p>
        ) : <div className="grid gap-3 md:grid-cols-2">
          {calculatedSupplements.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.note}</div>
                <div className="mt-1 text-sm font-semibold">{inr(item.rate)}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!item.rate || hasOptional(item.name)}
                onClick={() => addOptional(item.name, item.rate)}
              >
                {hasOptional(item.name) ? "Selected" : "Add optional"}
              </Button>
            </div>
          ))}
        </div>}
      </Card>

      <CustomAdd
        label="Quick optional — airfare, train, bus or other service"
        onAdd={(name, rate) =>
          set({
            optionals: [...draft.optionals, { id: uid(), custom_name: name, qty: 1, rate }],
          })
        }
      />
      {draft.optionals.map((x) => {
        const name =
          x.custom_name || d.activities.find((a) => a.id === x.activity_id)?.activity_name || "—";
        return (
          <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
            <span>Optional: {name}</span>
            <span>
              {inr(x.qty * x.rate)}
              <button
                className="ml-2 text-destructive"
                onClick={() => set({ optionals: draft.optionals.filter((y) => y.id !== x.id) })}
              >
                ×
              </button>
            </span>
          </div>
        );
      })}

      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
        Only selected supplements will appear in the quotation's optional section. They are kept
        outside the package cost, markup and GST calculations.
      </div>
    </div>
  );
}

function FinalizationPanel({
  draft,
  db,
  isFinalizing,
  onFinalize,
}: {
  draft: QuoteDraft;
  db: ReturnType<typeof useDB>;
  isFinalizing: boolean;
  onFinalize: () => void | Promise<void>;
}) {
  const review = validateQuoteForFinalization(draft, db);
  const version = draft.intended_version || 1;

  return (
    <Card className="mt-6 overflow-hidden border-primary/25">
      <div className="flex flex-col gap-3 border-b bg-primary/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-semibold">Generation control</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.revision_of_quote_id
              ? `This will create revision V${version}; the previous version remains unchanged.`
              : "This will create V1 and permanently lock the generated quotation."}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "w-fit",
            review.canFinalize
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {review.canFinalize ? "Ready to generate" : `${review.blockers.length} blocker(s)`}
        </Badge>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {review.blockers.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
                <XCircle className="h-4 w-4" /> Resolve before generation
              </div>
              <ul className="space-y-1.5 text-sm text-red-800">
                {review.blockers.map((item) => (
                  <li key={item.code}>
                    <span className="font-medium">{item.section}:</span> {item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {review.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertCircle className="h-4 w-4" /> Review warnings
              </div>
              <ul className="space-y-1.5 text-sm text-amber-900">
                {review.warnings.map((item) => (
                  <li key={item.code}>
                    <span className="font-medium">{item.section}:</span> {item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {review.canFinalize && review.warnings.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> All mandatory data and calculation checks passed.
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Audit promise
          </div>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>• Linked Query: {draft.linked_query_id || "Not linked"}</li>
            <li>• {review.scenarios.length} costing variation(s) checked</li>
            <li>• Generated version cannot be edited or deleted</li>
            <li>• Any change starts a new revision with a reason</li>
          </ul>
          <Button
            className="mt-4 w-full"
            disabled={!review.canFinalize || isFinalizing}
            onClick={onFinalize}
          >
            <FileText className="mr-2 h-4 w-4" />
            {isFinalizing ? "Generating…" : `Generate & Lock V${version}`}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// Summary sidebar
// ============================================================
function SummarySidebar({ draft }: { draft: QuoteDraft }) {
  const d = useDB();
  const routingNames = draft.routing
    .filter((r) => r.overnight)
    .map((r) => d.cities.find((c) => c.id === r.city_id)?.name)
    .filter(Boolean)
    .join(" → ");
  const running = useMemo(() => {
    const definition = draft.scenarios?.[0];
    const scenario = definition ? computeScenario(draft, definition, d) : null;
    return scenario?.grand_total ?? computeAddonsTotal(draft, d);
  }, [draft, d]);
  const endDate = addDaysISO(draft.start_date, draft.nights);
  const customer =
    draft.query_type === "B2B"
      ? draft.agent.agency || draft.agent.name
      : draft.query_type === "B2C"
        ? draft.guest.name
        : draft.brochure.theme;
  const recipient =
    draft.query_type === "B2B"
      ? draft.agent.name
      : draft.query_type === "B2C"
        ? draft.guest.email || draft.guest.phone
        : draft.brochure.tour_type;
  const serviceTotal =
    draft.transport.length +
    draft.activities.length +
    draft.entrances.length +
    draft.guides.length +
    draft.misc.length;
  const hotelOptions = draft.hotel_options.filter((option) => option.selections.length > 0).length;
  const readiness = [
    { label: "Recipient", ready: !!customer },
    {
      label: "Trip brief",
      ready: draft.nights > 0 && (draft.query_type === "Brochure" || totalPax(draft) > 0),
    },
    { label: "Programme", ready: !!draft.program_name },
    { label: "Routing", ready: draft.routing.some((day) => day.overnight && !!day.city_id) },
    { label: "Accommodation", ready: hotelOptions > 0 },
  ];
  const readyCount = readiness.filter((item) => item.ready).length;

  return (
    <div className="sticky top-4 space-y-3">
      <Card className="overflow-hidden shadow-sm">
        <div className="border-b bg-primary px-4 py-3 text-primary-foreground">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-75">
            Live quotation snapshot
          </div>
          <div className="mt-1 truncate text-sm font-bold">
            {customer || "Recipient not selected"}
          </div>
          {recipient && <div className="mt-0.5 truncate text-xs opacity-80">{recipient}</div>}
        </div>
        <div className="space-y-4 p-4 text-sm">
          <div className="flex items-center gap-2">
            {draft.query_type ? (
              <Badge>{draft.query_type}</Badge>
            ) : (
              <Badge variant="outline">Type pending</Badge>
            )}
            {draft.tour_type && <Badge variant="secondary">{draft.tour_type}</Badge>}
          </div>

          <SummaryField label="Programme" value={draft.program_name || "Not selected"} />
          <SummaryField
            label="Travel"
            value={
              draft.query_type === "Brochure"
                ? draft.brochure_validity_from && draft.brochure_validity_till
                  ? `${fmtDateShort(draft.brochure_validity_from)} – ${fmtDateShort(draft.brochure_validity_till)}`
                  : "Brochure validity"
                : draft.has_dates === false
                  ? "Day 1 → Day " + (draft.nights + 1)
                  : `${fmtDateShort(draft.start_date)} → ${fmtDateShort(endDate)}`
            }
            detail={`${draft.nights}N / ${draft.nights + 1}D`}
          />
          <SummaryField
            label="Travellers"
            value={
              draft.query_type === "Brochure"
                ? `${draft.pax_min || 0}–${draft.pax_max || 0} pax`
                : `${totalPax(draft)} pax`
            }
            detail={
              draft.query_type === "Brochure"
                ? undefined
                : `${draft.adults}A · ${draft.ss}SS · ${draft.children.length}C`
            }
          />
          <SummaryField label="Routing" value={routingNames || "Not prepared"} />

          <div className="grid grid-cols-2 gap-2 border-t pt-3">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <div className="text-[10px] uppercase text-muted-foreground">Services</div>
              <div className="mt-0.5 text-lg font-bold">{serviceTotal}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5">
              <div className="text-[10px] uppercase text-muted-foreground">Hotel options</div>
              <div className="mt-0.5 text-lg font-bold">{hotelOptions}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Readiness
          </div>
          <span className="text-xs font-semibold text-primary">
            {readyCount}/{readiness.length}
          </span>
        </div>
        <div className="space-y-2">
          {readiness.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <span className={item.ready ? "text-foreground" : "text-muted-foreground"}>
                {item.label}
              </span>
              {item.ready ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Clock className="h-4 w-4 text-amber-500" />
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-primary/15 bg-primary/[0.04] p-4 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Selected package estimate
        </div>
        <div className="mt-1 text-xl font-bold text-primary">{inr(running)}</div>
        <div className="mt-1 text-[10px] leading-4 text-muted-foreground">
          Uses the same selected-component calculation as Final Review.
        </div>
      </Card>
    </div>
  );
}

function SummaryField({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold leading-5">{value}</div>
      {detail && <div className="text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

// ============================================================
// NEW STEP 3 — Pax + Tour Type (StepTripBasics and sub-steps)
// ============================================================
function StepTripBasics({ draft, set }: StepProps) {
  return (
    <div className="space-y-8">
      <StepPaxType draft={draft} set={set} />
      <div className="border-t pt-6">
        <StepDeparture draft={draft} set={set} />
      </div>
      <div className="border-t pt-6">
        <StepTravel draft={draft} set={set} />
      </div>
      <div className="border-t pt-6">
        <StepDuration draft={draft} set={set} />
      </div>
    </div>
  );
}

// Fixed StepPaxType with local state for min/max and mutual exclusivity
function StepPaxType({ draft, set }: StepProps) {
  const isBrochure = draft.query_type === "Brochure";
  const totPax = draft.adults + draft.ss + draft.children.length;
  const pricingPax = effectivePaxForPricing(draft);
  const autoTourType: "FIT" | "GIT" | "Brochure" = isBrochure
    ? "Brochure"
    : pricingPax <= 5
      ? "FIT"
      : "GIT";

  useEffect(() => {
    if (draft.tour_type !== autoTourType) set({ tour_type: autoTourType });
  }, [autoTourType]);

  if (isBrochure) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">Pax Range & Tour Type</h2>
        <div className="p-3 rounded-lg bg-primary/5 flex items-center gap-2">
          <Badge className="bg-primary text-primary-foreground">Brochure</Badge>
          <span className="text-sm">Fixed brochure pricing across a pax range.</span>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <Label>Min Pax</Label>
            <Input
              type="number"
              min={1}
              value={draft.pax_min ?? 1}
              onChange={(e) => set({ pax_min: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </div>
          <div>
            <Label>Max Pax</Label>
            <Input
              type="number"
              min={1}
              value={draft.pax_max ?? 1}
              onChange={(e) => set({ pax_max: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground max-w-md">
          Costs for Activities / Guides / Miscellaneous can be entered with per-range prices in
          later steps.
        </p>
      </div>
    );
  }

  // B2B / B2C – custom range override with local state
  const currentOverride = draft.pax_range;
  const isAuto = currentOverride === "auto" || !currentOverride;

  const [localMin, setLocalMin] = useState<string>("");
  const [localMax, setLocalMax] = useState<string>("");

  useEffect(() => {
    if (isAuto) {
      setLocalMin("");
      setLocalMax("");
    } else {
      const [min, max] = currentOverride.split("-").map(Number);
      setLocalMin(min?.toString() ?? "");
      setLocalMax(max?.toString() ?? "");
    }
  }, [currentOverride, isAuto]);

  const applyRangeOverride = () => {
    const min = parseInt(localMin);
    const max = parseInt(localMax);
    if (!isNaN(min) && !isNaN(max) && min <= max) {
      set({ pax_range: `${min}-${max}` as any });
    } else {
      set({ pax_range: "auto" });
    }
  };

  const resetToAuto = () => {
    set({ pax_range: "auto" });
  };

  const isRangeActive = !isAuto;

  const handleAdultsChange = (v: number) => {
    set({ adults: v, pax_range: "auto" });
  };
  const handleSSChange = (v: number) => {
    set({ ss: v, pax_range: "auto" });
  };
  const handleChildrenChange = (v: number) => {
    const cur = draft.children.length;
    let newChildren;
    if (v > cur) {
      newChildren = [...draft.children, ...Array(v - cur).fill({ age: 5 })];
    } else {
      newChildren = draft.children.slice(0, Math.max(0, v));
    }
    set({ children: newChildren, pax_range: "auto" });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Pax & Tour Type</h2>
      <div className="flex items-center gap-3">
        <Badge
          className={cn(
            "text-sm px-3 py-1",
            autoTourType === "FIT" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white",
          )}
        >
          {autoTourType}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Auto-detected from pricing pax — 1-5 pax = FIT, 6+ = GIT.
        </span>
      </div>
      <Card className="p-4 space-y-3 max-w-lg">
        <div className="text-sm font-semibold">Pax</div>
        <PaxRow
          label="Adults"
          value={draft.adults}
          onChange={handleAdultsChange}
          disabled={isRangeActive}
        />
        <PaxRow
          label="SS (Senior/Special)"
          value={draft.ss}
          onChange={handleSSChange}
          disabled={isRangeActive}
        />
        <PaxRow
          label="Children"
          value={draft.children.length}
          onChange={handleChildrenChange}
          disabled={isRangeActive}
        />
        {draft.children.map((c, i) => (
          <div key={i} className="pl-8 flex items-center gap-3">
            <span className="text-sm">Child {i + 1}: Age</span>
            <Input
              type="number"
              min={0}
              max={17}
              value={c.age}
              className="w-20"
              disabled={isRangeActive}
              onChange={(e) => {
                const next = [...draft.children];
                next[i] = { age: parseInt(e.target.value) || 0 };
                set({ children: next, pax_range: "auto" });
              }}
            />
            <span className="text-xs text-muted-foreground">years</span>
          </div>
        ))}
        <div className="pt-2 border-t text-sm font-semibold">Total Pax: {totPax}</div>

        <div className="pt-2 border-t space-y-2">
          <div className="text-sm font-semibold">
            Traveler Type <span className="text-destructive">*</span>
          </div>
          <Select
            value={draft.traveler_type ?? "indian"}
            onValueChange={(v) => set({ traveler_type: v as "indian" | "foreign" | "student" })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="indian">Indian</SelectItem>
              <SelectItem value="foreign">Foreign</SelectItem>
              <SelectItem value="student">Student</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Activities and entrance fees are priced using this category.
          </p>
        </div>

        <div className="pt-2 border-t space-y-3">
          <Label className="text-xs">Pax Range (pricing slab override)</Label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Label className="text-xs">Min</Label>
              <Input
                type="number"
                min={1}
                className="w-20"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                placeholder="min"
                onBlur={applyRangeOverride}
              />
            </div>
            <span className="text-muted-foreground">–</span>
            <div className="flex items-center gap-1">
              <Label className="text-xs">Max</Label>
              <Input
                type="number"
                min={1}
                className="w-20"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                placeholder="max"
                onBlur={applyRangeOverride}
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetToAuto}>
              Use actual pax
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Current pricing pax: {pricingPax}.
            {!isAuto && (
              <span>
                {" "}
                Using override range <strong>{currentOverride}</strong>.
              </span>
            )}
            {isAuto && <span> Using actual pax.</span>}
            Guide, activities, misc, transport filters and group hotel room mixes use this slab.
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// StepDeparture (Brochure restricted list)
// ============================================================
function StepDeparture({ draft, set }: StepProps) {
  if (draft.query_type === "Brochure") {
    return (
      <div className="space-y-4 max-w-md">
        <h2 className="text-lg font-semibold">Ex (Departure Point)</h2>
        <Select
          value={draft.tour_start_city || draft.departure_city}
          onValueChange={(v) => set({ departure_city: v, tour_start_city: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose Ex point…" />
          </SelectTrigger>
          <SelectContent>
            {BROCHURE_EX_CITIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Brochure ex-points are limited to standard MP gateways.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Journey Gateways</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep the guest's home city separate from where the MP tour actually starts and ends.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Guest travelling from</Label>
          <CityCombobox
            value={draft.home_city || draft.guest.city || ""}
            onChange={(v) =>
              set({ home_city: v, guest: { ...draft.guest, city: draft.guest.city || v } })
            }
          />
          <p className="text-[11px] text-muted-foreground">Home/origin city; not used as Day 1 routing.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Tour starting city *</Label>
          <CityCombobox
            value={draft.tour_start_city || draft.departure_city}
            onChange={(v) => set({ tour_start_city: v, departure_city: v })}
          />
          <p className="text-[11px] text-muted-foreground">Becomes the starting point of Day 1.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Tour ending city *</Label>
          <CityCombobox
            value={draft.tour_end_city || ""}
            onChange={(v) => set({ tour_end_city: v })}
          />
          <p className="text-[11px] text-muted-foreground">Becomes the final routing destination.</p>
        </div>
      </div>
    </div>
  );
}

function CityCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const d = useDB();
  const [open, setOpen] = useState(false);

  const indian = useMemo(() => {
    const set = new Map<string, string>();
    [...INDIAN_CITIES, ...d.cities.map((c) => c.name)].forEach((n) => {
      if (n) set.set(n.toLowerCase(), n);
    });
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [d.cities]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || <span className="text-muted-foreground">Search city…</span>}
          <ChevronRight className="h-4 w-4 opacity-50 rotate-90" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Type to search city…" />
          <CommandList>
            <CommandEmpty>No city found.</CommandEmpty>
            <CommandGroup heading="Indian Cities">
              {indian.map((c) => (
                <CommandItem
                  key={`in-${c}`}
                  value={c}
                  onSelect={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")}
                  />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Other Countries">
              {INTERNATIONAL_CITIES.map((c) => (
                <CommandItem
                  key={`int-${c}`}
                  value={c}
                  onSelect={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")}
                  />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// StepTravel – Mode of Travel
// ============================================================
function StepTravel({ draft, set }: StepProps) {
  const setJourneyMode = (side: "arrival" | "departure", value: string) => {
    const arrival = side === "arrival" ? value : draft.arrival_mode;
    const departure = side === "departure" ? value : draft.departure_mode;
    set({
      [side === "arrival" ? "arrival_mode" : "departure_mode"]: value,
      travel_modes: Array.from(new Set([arrival, departure].filter(Boolean))) as string[],
    });
  };
  if (draft.query_type === "Brochure") {
    return (
      <div className="space-y-3 max-w-md">
        <h2 className="text-lg font-semibold">Mode of Travel</h2>
        <div className="p-4 rounded-lg bg-muted/40 text-sm">
          Not applicable for Brochure quotations — the packaged program handles internal transport.
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Arrival &amp; Departure</h2>
        <p className="mt-1 text-sm text-muted-foreground">Arrival and departure may use different transport modes. Travel class is intentionally not required.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(["arrival", "departure"] as const).map((side) => (
          <div key={side} className="space-y-1.5">
            <Label className="capitalize">{side} mode</Label>
            <Select
              value={side === "arrival" ? draft.arrival_mode || "" : draft.departure_mode || ""}
              onValueChange={(value) => setJourneyMode(side, value)}
            >
              <SelectTrigger><SelectValue placeholder={`Select ${side} mode`} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flight">Flight</SelectItem>
                <SelectItem value="train">Train</SelectItem>
                <SelectItem value="bus">Bus</SelectItem>
                <SelectItem value="road">By Road</SelectItem>
                <SelectItem value="self">Self Drive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {(draft.arrival_mode === "flight" || draft.departure_mode === "flight") && (
        <Card className="p-4 space-y-3">
          <div className="font-semibold text-sm flex items-center gap-2">✈ Flight Details</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {draft.arrival_mode === "flight" && <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Arrival Flight</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Flight No"
                  value={draft.arrival_flight?.flight_no || ""}
                  onChange={(e) =>
                    set({
                      arrival_flight: {
                        ...(draft.arrival_flight || {}),
                        flight_no: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  placeholder="From City"
                  value={draft.arrival_flight?.from_city || ""}
                  onChange={(e) =>
                    set({
                      arrival_flight: {
                        ...(draft.arrival_flight || {}),
                        from_city: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  type="date"
                  value={draft.arrival_flight?.date || ""}
                  onChange={(e) =>
                    set({
                      arrival_flight: { ...(draft.arrival_flight || {}), date: e.target.value },
                    })
                  }
                />
                <Input
                  type="time"
                  value={draft.arrival_flight?.time || ""}
                  onChange={(e) =>
                    set({
                      arrival_flight: { ...(draft.arrival_flight || {}), time: e.target.value },
                    })
                  }
                />
              </div>
            </div>}
            {draft.departure_mode === "flight" && <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Departure Flight</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Flight No"
                  value={draft.departure_flight?.flight_no || ""}
                  onChange={(e) =>
                    set({
                      departure_flight: {
                        ...(draft.departure_flight || {}),
                        flight_no: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  placeholder="To City"
                  value={draft.departure_flight?.to_city || ""}
                  onChange={(e) =>
                    set({
                      departure_flight: {
                        ...(draft.departure_flight || {}),
                        to_city: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  type="date"
                  value={draft.departure_flight?.date || ""}
                  onChange={(e) =>
                    set({
                      departure_flight: { ...(draft.departure_flight || {}), date: e.target.value },
                    })
                  }
                />
                <Input
                  type="time"
                  value={draft.departure_flight?.time || ""}
                  onChange={(e) =>
                    set({
                      departure_flight: { ...(draft.departure_flight || {}), time: e.target.value },
                    })
                  }
                />
              </div>
            </div>}
          </div>
        </Card>
      )}

      {(draft.arrival_mode === "train" || draft.departure_mode === "train") && (
        <Card className="p-4 space-y-3">
          <div className="font-semibold text-sm flex items-center gap-2">🚂 Train Details</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {draft.arrival_mode === "train" && <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Arrival Train</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Train Name / No"
                  value={draft.arrival_train?.train_name || ""}
                  onChange={(e) =>
                    set({
                      arrival_train: { ...(draft.arrival_train || {}), train_name: e.target.value },
                    })
                  }
                />
                <Input
                  placeholder="From City"
                  value={draft.arrival_train?.from_city || ""}
                  onChange={(e) =>
                    set({
                      arrival_train: { ...(draft.arrival_train || {}), from_city: e.target.value },
                    })
                  }
                />
                <Input
                  type="date"
                  value={draft.arrival_train?.date || ""}
                  onChange={(e) =>
                    set({ arrival_train: { ...(draft.arrival_train || {}), date: e.target.value } })
                  }
                />
                <Input
                  type="time"
                  value={draft.arrival_train?.time || ""}
                  onChange={(e) =>
                    set({ arrival_train: { ...(draft.arrival_train || {}), time: e.target.value } })
                  }
                />
                <Input
                  placeholder="PNR"
                  value={draft.arrival_train?.pnr || ""}
                  onChange={(e) =>
                    set({ arrival_train: { ...(draft.arrival_train || {}), pnr: e.target.value } })
                  }
                />
              </div>
            </div>}
            {draft.departure_mode === "train" && <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Departure Train</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Train Name / No"
                  value={draft.departure_train?.train_name || ""}
                  onChange={(e) =>
                    set({
                      departure_train: {
                        ...(draft.departure_train || {}),
                        train_name: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  placeholder="To City"
                  value={draft.departure_train?.to_city || ""}
                  onChange={(e) =>
                    set({
                      departure_train: {
                        ...(draft.departure_train || {}),
                        to_city: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  type="date"
                  value={draft.departure_train?.date || ""}
                  onChange={(e) =>
                    set({
                      departure_train: { ...(draft.departure_train || {}), date: e.target.value },
                    })
                  }
                />
                <Input
                  type="time"
                  value={draft.departure_train?.time || ""}
                  onChange={(e) =>
                    set({
                      departure_train: { ...(draft.departure_train || {}), time: e.target.value },
                    })
                  }
                />
                <Input
                  placeholder="PNR"
                  value={draft.departure_train?.pnr || ""}
                  onChange={(e) =>
                    set({
                      departure_train: { ...(draft.departure_train || {}), pnr: e.target.value },
                    })
                  }
                />
              </div>
            </div>}
          </div>
        </Card>
      )}

      {([draft.arrival_mode, draft.departure_mode].some((mode) => mode === "bus" || mode === "road" || mode === "self")) && (
        <Card className="p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["arrival", "departure"] as const).map((side) => {
              const mode = side === "arrival" ? draft.arrival_mode : draft.departure_mode;
              if (!mode || !["bus", "road", "self"].includes(mode)) return null;
              const detail = side === "arrival" ? draft.arrival_other || {} : draft.departure_other || {};
              const patch = (value: Partial<typeof detail>) =>
                set(side === "arrival" ? { arrival_other: { ...detail, ...value } } : { departure_other: { ...detail, ...value } });
              return (
                <div key={side} className="space-y-2 rounded-lg border p-3">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">{side} · {mode}</div>
                  <Input placeholder="Service / bus name" value={detail.service_name || ""} onChange={(event) => patch({ service_name: event.target.value })} />
                  <Input placeholder="Number (if applicable)" value={detail.service_number || ""} onChange={(event) => patch({ service_number: event.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="From" value={detail.from_city || ""} onChange={(event) => patch({ from_city: event.target.value })} />
                    <Input placeholder="To" value={detail.to_city || ""} onChange={(event) => patch({ to_city: event.target.value })} />
                  </div>
                  <Input placeholder="Timing / distance / remarks" value={detail.remarks || ""} onChange={(event) => patch({ remarks: event.target.value })} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// StepDuration – Duration
// ============================================================
function StepDuration({ draft, set }: StepProps) {
  const isBrochure = draft.query_type === "Brochure";
  const hasDates = draft.has_dates !== false;
  const endDate = addDaysISO(draft.start_date, draft.nights);

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold">Duration</h2>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div>
          <Label>Nights</Label>
          <Input
            type="number"
            min={1}
            value={draft.nights}
            onChange={(e) => set({ nights: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>
        <div>
          <Label>Days</Label>
          <Input value={draft.nights + 1} readOnly className="bg-muted" />
        </div>
      </div>

      {isBrochure ? (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Brochure Validity Period</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valid From</Label>
              <Input
                type="date"
                value={draft.brochure_validity_from || ""}
                onChange={(e) => set({ brochure_validity_from: e.target.value })}
              />
            </div>
            <div>
              <Label>Valid Till</Label>
              <Input
                type="date"
                value={draft.brochure_validity_till || ""}
                onChange={(e) => set({ brochure_validity_till: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Programs use Day 1, Day 2… labels instead of calendar dates.
          </p>
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <RadioGroup
            value={hasDates ? "yes" : "no"}
            onValueChange={(v) => set({ has_dates: v === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="hd-yes" />
              <label htmlFor="hd-yes" className="text-sm font-medium cursor-pointer">
                With Dates
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="hd-no" />
              <label htmlFor="hd-no" className="text-sm font-medium cursor-pointer">
                Without Dates (Day 1, Day 2…)
              </label>
            </div>
          </RadioGroup>
          {hasDates && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label>Tour Starting Date</Label>
                <Input
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => set({ start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Tour Ending Date</Label>
                <Input value={fmtDateShort(endDate)} readOnly className="bg-muted" />
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="p-4 bg-primary/5 rounded-lg text-center">
        <div className="text-2xl font-bold text-primary">
          {draft.nights} Nights / {draft.nights + 1} Days
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helper: PaxRow with disabled prop
// ============================================================
function PaxRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={disabled}
        >
          −
        </Button>
        <Input value={value} readOnly className="w-14 text-center" disabled={disabled} />
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={() => onChange(value + 1)}
          disabled={disabled}
        >
          +
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Note: Step10, Step11, Step12, Step13, Step14, Step15, Step16, Step17
// are imported from separate files and used in StepContent.
// ============================================================

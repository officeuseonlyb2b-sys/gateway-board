import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Calculator, Check, ChevronLeft, ChevronRight, ChevronDown, Save, Plus, Trash2,
  Building2, User, Users, FileText, Printer, FileDown, FileSpreadsheet,
  Star, AlertCircle, X,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { inr, addDaysISO, fmtDateShort } from "@/lib/format";
import { useDB, MEAL_PLANS, type MealPlan, guideRateForPax, activityRateForPax, GUIDE_LANGUAGES, guideConfiguredLanguages, miscRateForPax, type GuideLanguage } from "@/lib/mock-store";
import { useAuth } from "@/lib/auth-mock";
import {
  useDraft, writeDraft, clearDraft, initDraft, loadDraft,
} from "@/lib/wizard/store";
import {
  upsertDraft, getDraft, deleteDraft, migrateLegacyDraft,
} from "@/lib/drafts-store";
import { addNotification } from "@/lib/notifications-store";
import type {
  QuoteDraft, QueryType, RoutingDay, OptionKey, HotelOption,
  PersonAllocation, PersonRoomType,
} from "@/lib/wizard/types";
import { emptyDraft } from "@/lib/wizard/types";
import { useAgents, usePrograms, type Agent } from "@/lib/wizard/agents-store";
import {
  computeOption, computeAddonsTotal, totalPax, effectivePaxForPricing, gstRateFor, transportLineTotal,
  computePersonTotals, optionUsesCustomAllocation, normalizeAllocations,
  defaultAllocations, presetAllSingle, presetAllDouble, presetOneSingleRestDouble,
  personRoomTypeLabel, lookupOptionNightlyRates,
  isGroupTour, autoDoubleMix, autoTripleMix, mixCoversPax, mixLabel,
  computeGroupOption,
  type OptionTotals, type PersonOptionTotal, type GroupOptionTotals,
} from "@/lib/wizard/calc";

import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import { defaultsForCategory } from "@/lib/wizard/category-defaults";
import { nextQuoteNumber, saveQuote as persistQuote, type SavedQuote } from "@/lib/quotes-store";
import { setActiveWizard } from "@/lib/wizard/active-wizard";
import { QuoteViewerDialog } from "@/components/QuoteViewerDialog";
import { QuickAddHotelDialog } from "@/components/QuickAddHotelDialog";
import { AgentFormDialog } from "@/components/AgentFormDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { uid, CustomAdd } from "@/components/quotation/shared";
import { Step10 } from "@/components/quotation/steps/StepTransport";
import { Step11 } from "@/components/quotation/steps/StepActivities";
import { Step12 } from "@/components/quotation/steps/StepEntrances";
import { Step13 } from "@/components/quotation/steps/StepGuide";
import { Step14 } from "@/components/quotation/steps/StepMisc";
import { Step15 } from "@/components/quotation/steps/StepHotels";
import { Step16 } from "@/components/quotation/steps/StepCosting";
import { Step17 } from "@/components/quotation/steps/StepFinal";
import { StepAllocation } from "@/components/quotation/steps/StepAllocation";

export const Route = createFileRoute("/_authenticated/costing")({
  head: () => ({ meta: [{ title: "New Quotation — MP Tourism Hub" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s.id === "string" ? s.id : undefined }),
  component: WizardPage,
});

// ============================================================
// Step definitions
// ============================================================
const TOTAL_STEPS = 16;
const STEPS: { n: number; label: string }[] = [
  { n: 1, label: "Type" }, { n: 2, label: "Who" }, { n: 3, label: "Trip Basics" },
  { n: 4, label: "Program" }, { n: 5, label: "Create Route" }, { n: 6, label: "Routing" },
  { n: 7, label: "Activities" }, { n: 8, label: "Entrances" }, { n: 9, label: "Guide" },
  { n: 10, label: "Misc" }, { n: 11, label: "Transport" }, { n: 12, label: "Room Allocation" },
  { n: 13, label: "Hotels" }, { n: 14, label: "Costing" }, { n: 15, label: "Final" },
  { n: 16, label: "Optionals" },
];


/** Brochure departure ex-points (Ex-City list) */
const BROCHURE_EX_CITIES = [
  "Ex-Bhopal", "Ex-Indore", "Ex-Jabalpur", "Ex-Gwalior", "Ex-Ujjain",
  "Ex-Delhi", "Ex-Mumbai", "Ex-Nagpur", "Ex-Raipur",
];

const CATEGORY_TAGS = [
  "Wildlife", "Heritage", "Pilgrimage", "Adventure", "Beach",
  "Hill Station", "Cultural", "Corporate", "Honeymoon", "Family",
];
const TRAVEL_MODES = [
  { id: "flight", label: "Flight", icon: "✈" },
  { id: "train", label: "Train", icon: "🚂" },
  { id: "car", label: "Car", icon: "🚗" },
  { id: "self", label: "Self Drive", icon: "🏍" },
];

/** Major Indian cities available for "Guest Travelling From" */
const INDIAN_CITIES = [
  "Agra", "Ahmedabad", "Ajmer", "Amritsar", "Aurangabad", "Bengaluru", "Bhopal",
  "Bhubaneswar", "Chandigarh", "Chennai", "Coimbatore", "Dehradun", "Delhi",
  "Gangtok", "Goa", "Guwahati", "Gwalior", "Hyderabad", "Indore", "Jabalpur",
  "Jaipur", "Jaisalmer", "Jammu", "Jodhpur", "Kanpur", "Khajuraho", "Kochi",
  "Kolkata", "Leh", "Lucknow", "Ludhiana", "Madurai", "Mangalore", "Mumbai",
  "Mysuru", "Nagpur", "Nashik", "Patna", "Puducherry", "Pune", "Raipur",
  "Ranchi", "Rishikesh", "Shimla", "Siliguri", "Srinagar", "Surat", "Thiruvananthapuram",
  "Tiruchirappalli", "Udaipur", "Ujjain", "Vadodara", "Varanasi", "Vijayawada",
  "Visakhapatnam",
].sort();

const INTERNATIONAL_CITIES = [
  "Abu Dhabi", "Amsterdam", "Auckland", "Bangkok", "Barcelona", "Beijing",
  "Berlin", "Cape Town", "Colombo", "Dhaka", "Doha", "Dubai", "Frankfurt",
  "Hong Kong", "Istanbul", "Jakarta", "Johannesburg", "Kathmandu", "Kuala Lumpur",
  "Kuwait City", "London", "Los Angeles", "Male", "Manila", "Melbourne",
  "Moscow", "Muscat", "New York", "Paris", "Riyadh", "Rome", "San Francisco",
  "Seoul", "Shanghai", "Singapore", "Sydney", "Tokyo", "Toronto", "Vancouver",
  "Vienna", "Zurich",
].sort();


// ============================================================
// Root
// ============================================================
function WizardPage() {
  const draft = useDraft();
  const search = Route.useSearch();
  const [showBanner, setShowBanner] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (initialized) return;
    // Migrate any legacy single-slot draft into the new drafts array.
    migrateLegacyDraft();

    // Resume a specific draft when navigated with ?id=...
    if (search.id) {
      const rec = getDraft(search.id);
      if (rec) {
        writeDraft(rec.wizard_state);
        setCurrentDraftId(rec.id);
        setInitialized(true);
        return;
      }
    }

    // Prefer the draft already read by useSyncExternalStore; fall back to a direct read.
    const existing = draft || loadDraft();
    if (existing) setShowBanner(true);
    else initDraft();
    setInitialized(true);
  }, [initialized, search.id, draft]);

  // Publish active-wizard metadata whenever the draft moves — so other
  // pages can show the "Continue Quotation" banner. Cleared on discard/save.
  useEffect(() => {
    if (!draft) return;
    if (draft.step <= 1) { setActiveWizard(null); return; }
    setActiveWizard({
      draftId: currentDraftId,
      programName: draft.program_name || (draft.query_type === "B2B" ? draft.agent.name : draft.query_type === "B2C" ? draft.guest.name : draft.brochure.theme) || "Untitled",
      step: draft.step,
      savedAt: draft.updated_at,
    });
  }, [draft, currentDraftId]);

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
        kind: "info", category: "draft_saved",
        title: "Draft saved",
        message: `"${opts?.name || nextState.program_name || "Draft"}" saved. Resume anytime from Drafts.`,
        href: "/drafts",
      });
    }
    return id;
  };

  const go = (n: number) => {
    if (n < 1 || n > TOTAL_STEPS) return;
    if (n > step && !canProceed) return;
    const current = loadDraft() ?? draft;
    const next = { ...current, step: n };
    writeDraft(next);
    // Auto-save when moving forward past identification.
    if (n > step && n >= 3) {
      persistToDrafts(next, { silent: true });
    }
  };

  return (
    <div className="min-h-full bg-muted/20">
      {showBanner && draft.step > 1 && (
        <div className="bg-accent/10 border-b border-accent/30 px-6 py-2 flex items-center justify-between text-sm">
          <span>
            Resuming draft from {new Date(draft.updated_at).toLocaleString("en-IN")}.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowBanner(false)}>Continue</Button>
            <Button size="sm" variant="outline" onClick={() => { clearDraft(); initDraft(); setCurrentDraftId(null); setShowBanner(false); }}>
              Discard & start new
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calculator className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">New Quotation</h1>
              <p className="text-sm text-muted-foreground">
                Step {step} of {TOTAL_STEPS} — {STEPS[step - 1].label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const name = window.prompt("Name this draft (optional):", draft.program_name || "") || undefined;
              persistToDrafts(draft, { name });
              toast.success("Draft saved.");
            }}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save Draft
            </Button>
            <Button variant="ghost" size="sm" onClick={() => {
              if (confirm("Discard all progress and start over?")) {
                if (currentDraftId) deleteDraft(currentDraftId);
                setCurrentDraftId(null);
                clearDraft();
                setActiveWizard(null);
                writeDraft(emptyDraft());
              }
            }}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Discard
            </Button>
          </div>
        </div>

        <ProgressBar step={step} onJump={go} />

        <div className="mt-6">
          <Card className="p-6 card-elevated">
            <StepContent draft={draft} set={set} />
          </Card>
        </div>

        {/* Nav footer */}
        <div className="flex justify-between mt-6">
          <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={() => go(step + 1)} disabled={!canProceed}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
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
                    done && "bg-primary border-primary text-primary-foreground group-hover:brightness-110",
                    active && "bg-accent border-accent text-accent-foreground",
                    !done && !active && "bg-background border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : s.n}
                </div>
                <span className={cn(
                  "text-[10px] font-medium leading-tight text-center",
                  active ? "text-accent" : done ? "text-primary" : "text-muted-foreground",
                )}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "h-[2px] w-4 mt-4",
                  step > s.n ? "bg-primary" : "bg-muted-foreground/20",
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Validation — matches the reordered 18-step flow
// ============================================================
function validate(d: QuoteDraft, step: number): boolean {
  switch (step) {
    case 1: return d.query_type !== null;
    case 2:
      if (d.query_type === "B2B") return !!d.agent.name;
      if (d.query_type === "B2C") return !!d.guest.name;
      if (d.query_type === "Brochure") return !!d.brochure.tour_type;
      return false;
    case 3: {
      // Combined Trip Basics — Pax + Type, Departure, Travel, Duration
      const paxOk = d.query_type === "Brochure"
        ? (d.pax_min ?? 0) >= 1 && (d.pax_max ?? 0) >= (d.pax_min ?? 0)
        : (d.adults + d.ss + d.children.length) >= 1;
      if (!paxOk) return false;
      if (!d.departure_city) return false;
      if (d.query_type !== "Brochure" && d.travel_modes.length < 1) return false;
      if (d.nights < 1) return false;
      if (d.query_type === "Brochure") return !!d.brochure_validity_from && !!d.brochure_validity_till;
      if (d.has_dates === false) return true;
      return !!d.start_date;
    }
    case 4: return d.program_mode === "existing" ? !!d.program_id : !!d.program_name;
    case 5: return true; // Create-route gate — always allow (button generates rows)
    case 6: {
      const overnightRows = d.routing.filter((r) => r.overnight);
      if (overnightRows.length === 0) return false;
      return overnightRows.some((r) => !!r.city_id);
    }
    case 13: {
      const overnightCities = d.routing.filter((r) => r.overnight && r.city_id).map((r) => r.city_id);
      if (overnightCities.length === 0) return true;
      const A = d.hotel_options.find((o) => o.key === "A");
      if (!A) return false;
      return overnightCities.every((cid) => A.selections.some((s) => s.city_id === cid));
    }
    default: return true;
  }
}

// ============================================================
// Step router — maps slot → component
// ============================================================
function StepContent({ draft, set }: { draft: QuoteDraft; set: (p: Partial<QuoteDraft>) => void }) {
  switch (Math.min(draft.step, TOTAL_STEPS)) {
    case 1: return <Step1 draft={draft} set={set} />;
    case 2: return <Step2 draft={draft} set={set} />;
    case 3: return <StepTripBasics draft={draft} set={set} />;
    case 4: return <Step4 draft={draft} set={set} />;
    case 5: return <StepCreateRoute draft={draft} set={set} />;
    case 6: return <Step9 draft={draft} set={set} />;
    case 7: return <Step11 draft={draft} set={set} />;
    case 8: return <Step12 draft={draft} set={set} />;
    case 9: return <Step13 draft={draft} set={set} />;
    case 10: return <Step14 draft={draft} set={set} />;
    case 11: return <Step10 draft={draft} set={set} />;
    case 12: return <StepAllocation draft={draft} set={set} />;
    case 13: return <Step15 draft={draft} set={set} />;
    case 14: return <Step16 draft={draft} set={set} />;
    case 15: return <Step17 draft={draft} set={set} />;
    case 16: return <Step18 draft={draft} set={set} />;
    default: return null;
  }
}

type StepProps = { draft: QuoteDraft; set: (p: Partial<QuoteDraft>) => void };

// ============================================================
// STEP 1 — Query Type
// ============================================================
function Step1({ draft, set }: StepProps) {
  const opts: { key: QueryType; title: string; desc: string; icon: typeof Building2 }[] = [
    { key: "B2B", title: "B2B", desc: "Travel Agent Quotation", icon: Building2 },
    { key: "B2C", title: "B2C", desc: "Direct Guest Quotation", icon: User },
    { key: "Brochure", title: "Brochure", desc: "Group / Package / Event", icon: Users },
  ];
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Select Query Type</h2>
      <p className="text-sm text-muted-foreground mb-6">Choose the type of quotation you are creating.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = draft.query_type === o.key;
          return (
            <button key={o.key} onClick={() => set({ query_type: o.key })}
              className={cn(
                "border-2 rounded-xl p-6 text-left transition-all hover:shadow-md",
                active ? "border-accent bg-accent/5 shadow-md" : "border-border bg-background hover:border-primary/40",
              )}>
              <Icon className={cn("h-8 w-8 mb-3", active ? "text-accent" : "text-primary")} />
              <div className="text-xl font-bold mb-1">{o.title}</div>
              <div className="text-sm text-muted-foreground">{o.desc}</div>
              {active && <Badge className="mt-3 bg-accent text-accent-foreground">Selected</Badge>}
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

  // Keep draft in sync when the selected agent's master record changes.
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
      set({ agent: { agent_id: a.id, name: a.name, agency: a.agency, phone: a.phone, email: a.email } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  const applyAgent = (a: Agent) => {
    set({ agent: { agent_id: a.id, name: a.name, agency: a.agency, phone: a.phone, email: a.email } });
    setEditMode(false);
  };

  if (draft.query_type === "B2B") {
    const selected = draft.agent.agent_id ? agents.find((a) => a.id === draft.agent.agent_id) : undefined;
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Agent Details</h2>
        <div>
          <Label>Select Agent</Label>
          <div className="flex gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                  {selected ? `${selected.name} — ${selected.agency}` : draft.agent.name ? `${draft.agent.name}${draft.agent.agency ? " — " + draft.agent.agency : ""}` : "Search agent by name, agency, mobile, email…"}
                  <ChevronRight className="h-4 w-4 opacity-50 rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command
                  filter={(value, search) => {
                    // value is the id; look up the agent and match against its searchable fields
                    const a = agents.find((x) => x.id === value);
                    if (!a) return 0;
                    const hay = [a.name, a.agency, a.phone, a.email, a.city].filter(Boolean).join(" ").toLowerCase();
                    return hay.includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Search agents…" />
                  <CommandList>
                    <CommandEmpty>No agents found.</CommandEmpty>
                    <CommandGroup>
                      {agents.map((a) => (
                        <CommandItem key={a.id} value={a.id} onSelect={() => { applyAgent(a); setPickerOpen(false); }}>
                          <div className="flex flex-col">
                            <span className="font-medium">{a.name} <span className="text-muted-foreground font-normal">— {a.agency}</span></span>
                            <span className="text-xs text-muted-foreground">{[a.phone, a.email, a.city].filter(Boolean).join(" · ")}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="outline" onClick={() => { setEditingAgent(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add New
            </Button>
            {selected && (
              <Button variant="outline" onClick={() => { setEditingAgent(selected); setFormOpen(true); }}>
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Agent Name</Label><Input readOnly={!!selected && !editMode} value={draft.agent.name} onChange={(e) => set({ agent: { ...draft.agent, name: e.target.value } })} /></div>
          <div><Label>Agency Name</Label><Input readOnly={!!selected && !editMode} value={draft.agent.agency} onChange={(e) => set({ agent: { ...draft.agent, agency: e.target.value } })} /></div>
          <div><Label>Phone</Label><Input readOnly={!!selected && !editMode} value={draft.agent.phone} onChange={(e) => set({ agent: { ...draft.agent, phone: e.target.value } })} /></div>
          <div><Label>Email</Label><Input readOnly={!!selected && !editMode} value={draft.agent.email} onChange={(e) => set({ agent: { ...draft.agent, email: e.target.value } })} /></div>
        </div>

        {selected && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Fields auto-filled from master.</span>
            {!editMode ? (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditMode(true)}>Override for this quote</Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { if (selected) applyAgent(selected); }}>Reset to master</Button>
            )}
          </div>
        )}

        <AgentFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          agent={editingAgent}
          onSaved={(a) => { applyAgent(a); }}
        />
      </div>
    );
  }
  if (draft.query_type === "B2C") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Guest Details</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Guest Name</Label><Input value={draft.guest.name} onChange={(e) => set({ guest: { ...draft.guest, name: e.target.value } })} /></div>
          <div><Label>Phone</Label><Input value={draft.guest.phone} onChange={(e) => set({ guest: { ...draft.guest, phone: e.target.value } })} /></div>
          <div><Label>Email</Label><Input value={draft.guest.email} onChange={(e) => set({ guest: { ...draft.guest, email: e.target.value } })} /></div>
          <div><Label>City (travelling from)</Label><Input value={draft.guest.city} onChange={(e) => set({ guest: { ...draft.guest, city: e.target.value } })} /></div>
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
          <Select value={draft.brochure.tour_type} onValueChange={(v) => set({ brochure: { ...draft.brochure, tour_type: v } })}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {["Leisure", "Pilgrimage", "Adventure", "Corporate", "Wedding", "Event"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Purpose / Theme</Label><Input value={draft.brochure.theme} onChange={(e) => set({ brochure: { ...draft.brochure, theme: e.target.value } })} /></div>
        <div><Label>Event / Season</Label><Input placeholder="e.g. Diwali Special" value={draft.brochure.event} onChange={(e) => set({ brochure: { ...draft.brochure, event: e.target.value } })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Period From</Label><Input type="date" value={draft.brochure.period_start} onChange={(e) => set({ brochure: { ...draft.brochure, period_start: e.target.value } })} /></div>
          <div><Label>Period To</Label><Input type="date" value={draft.brochure.period_end} onChange={(e) => set({ brochure: { ...draft.brochure, period_end: e.target.value } })} /></div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 3 — Duration
// ============================================================
function Step3({ draft, set }: StepProps) {
  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-lg font-semibold">Tour Duration</h2>
      <div>
        <Label>Number of Nights</Label>
        <Input type="number" min={1} value={draft.nights}
          onChange={(e) => set({ nights: Math.max(1, parseInt(e.target.value) || 1) })} />
      </div>
      <div>
        <Label>Number of Days</Label>
        <Input value={draft.nights + 1} readOnly className="bg-muted" />
      </div>
      <div className="p-4 bg-primary/5 rounded-lg text-center">
        <div className="text-3xl font-bold text-primary">{draft.nights} Nights / {draft.nights + 1} Days</div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 4 — Program
// ============================================================
function Step4({ draft, set }: StepProps) {
  const programs = usePrograms();
  const db = useDB();

  const applyProgram = (id: string) => {
    const p = programs.find((x) => x.id === id);
    if (!p) return;
    // Resolve city names → city_ids via DB.
    const nameToId = (name: string | null) => {
      if (!name) return "";
      return db.cities.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id || "";
    };
    const routing: RoutingDay[] = p.routing.map((r, i) => ({
      day: r.day,
      date: addDaysISO(draft.start_date, i),
      city_id: nameToId(r.overnight_city),
      program: r.program_text,
      program_mode: "text",
      overnight: r.overnight_city !== null,
    }));
    writeDraft({
      ...draft,
      program_id: p.id,
      program_name: p.name,
      program_mode: "existing",
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Program Selection</h2>
      <RadioGroup value={draft.program_mode} onValueChange={(v) => set({ program_mode: v as "existing" | "new" })}>
        <div className="flex items-start gap-3 p-4 border rounded-lg">
          <RadioGroupItem value="existing" id="pm-e" className="mt-1" />
          <div className="flex-1">
            <label htmlFor="pm-e" className="font-medium cursor-pointer">Pre-Select Existing Program</label>
            {draft.program_mode === "existing" && (
              <>
                <Select value={draft.program_id || ""} onValueChange={applyProgram}>
                  <SelectTrigger className="mt-2"><SelectValue placeholder="Choose program…" /></SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.nights}N)</SelectItem>)}
                  </SelectContent>
                </Select>
                {draft.program_id && (
                  <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    ✓ Auto-filled from <b>{draft.program_name}</b> — routing, category, departure, travel mode & inclusions loaded. You can modify anything in later steps.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 border rounded-lg">
          <RadioGroupItem value="new" id="pm-n" className="mt-1" />
          <div className="flex-1">
            <label htmlFor="pm-n" className="font-medium cursor-pointer">New Routing / Customized</label>
            {draft.program_mode === "new" && (
              <Input placeholder="Program Name (e.g. Bhopal-Sanchi-Bhimbetka Heritage Tour)"
                value={draft.program_name}
                onChange={(e) => set({ program_name: e.target.value })}
                className="mt-2" />
            )}
          </div>
        </div>
      </RadioGroup>
    </div>
  );
}

// ============================================================
// STEP 5 — Dates & Pax
// ============================================================
function Step5({ draft, set }: StepProps) {
  const endDate = addDaysISO(draft.start_date, draft.nights);
  const totPax = draft.adults + draft.ss + draft.children.length;
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Dates & Pax</h2>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Tour Starting Date</Label><Input type="date" value={draft.start_date}
          onChange={(e) => set({ start_date: e.target.value })} /></div>
        <div><Label>Tour Ending Date</Label><Input value={fmtDateShort(endDate)} readOnly className="bg-muted" /></div>
      </div>
      <div className="p-3 bg-primary/5 rounded-lg text-sm text-primary font-medium">
        {fmtDateShort(draft.start_date)} → {fmtDateShort(endDate)} ({draft.nights} Nights / {draft.nights + 1} Days)
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">Pax</div>
        <PaxRow label="Adults" value={draft.adults} onChange={(v) => set({ adults: v })} />
        <PaxRow label="SS (Senior/Special)" value={draft.ss} onChange={(v) => set({ ss: v })} />
        <PaxRow label="Children" value={draft.children.length} onChange={(v) => {
          const cur = draft.children.length;
          if (v > cur) set({ children: [...draft.children, ...Array(v - cur).fill({ age: 5 })] });
          else set({ children: draft.children.slice(0, Math.max(0, v)) });
        }} />
        {draft.children.map((c, i) => (
          <div key={i} className="pl-8 flex items-center gap-3">
            <span className="text-sm">Child {i + 1}: Age</span>
            <Input type="number" min={0} max={17} value={c.age} className="w-20"
              onChange={(e) => {
                const next = [...draft.children];
                next[i] = { age: parseInt(e.target.value) || 0 };
                set({ children: next });
              }} />
            <span className="text-xs text-muted-foreground">years</span>
          </div>
        ))}
        <div className="pt-2 border-t text-sm font-semibold">Total Pax: {totPax}</div>
        <div className="pt-2 border-t space-y-1">
          <Label className="text-xs">Pax Range (used for tiered pricing)</Label>
          <div className="flex flex-wrap gap-1">
            {(["auto", "1-5", "6-14", "15-24", "25+"] as const).map((r) => {
              const active = (draft.pax_range ?? "auto") === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ pax_range: r })}
                  className={`px-2 py-1 text-[11px] rounded ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {r === "auto" ? "Auto (by headcount)" : r}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Auto uses the actual head count. Selecting a range forces guide, activity and misc slabs to that band.
          </p>
        </div>
      </Card>
    </div>
  );
}
function PaxRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onChange(Math.max(0, value - 1))}>−</Button>
        <Input value={value} readOnly className="w-14 text-center" />
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onChange(value + 1)}>+</Button>
      </div>
    </div>
  );
}

// ============================================================
// STEP 6 — Category
// ============================================================
function Step6({ draft, set }: StepProps) {
  const toggle = (t: string) => {
    const has = draft.categories.includes(t);
    set({ categories: has ? draft.categories.filter((x) => x !== t) : [...draft.categories, t] });
  };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Program Category</h2>
      <p className="text-sm text-muted-foreground">Select one or more categories.</p>
      <div className="flex flex-wrap gap-2">
        {CATEGORY_TAGS.map((t) => {
          const on = draft.categories.includes(t);
          return (
            <button key={t} onClick={() => toggle(t)}
              className={cn(
                "px-4 py-2 rounded-full border-2 text-sm font-medium transition-colors",
                on ? "bg-accent text-accent-foreground border-accent" : "bg-background border-border hover:border-primary/40",
              )}>
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// STEP 7 — Departure
// ============================================================
function Step7({ draft, set }: StepProps) {
  const d = useDB();
  if (draft.query_type === "Brochure") {
    return (
      <div className="space-y-4 max-w-md">
        <h2 className="text-lg font-semibold">Ex (Departure Point)</h2>
        <Input placeholder="e.g. Ex-Bhopal, Ex-Delhi" value={draft.departure_city}
          onChange={(e) => set({ departure_city: e.target.value })} />
      </div>
    );
  }
  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-lg font-semibold">Guest Travelling From</h2>
      <Select value={draft.departure_city} onValueChange={(v) => set({ departure_city: v })}>
        <SelectTrigger><SelectValue placeholder="Select city…" /></SelectTrigger>
        <SelectContent>
          {d.cities.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================
// STEP 8 — Mode of Travel
// ============================================================
function Step8({ draft, set }: StepProps) {
  const toggle = (id: string) => {
    const has = draft.travel_modes.includes(id);
    set({ travel_modes: has ? draft.travel_modes.filter((x) => x !== id) : [...draft.travel_modes, id] });
  };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Mode of Travel</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TRAVEL_MODES.map((m) => {
          const on = draft.travel_modes.includes(m.id);
          return (
            <button key={m.id} onClick={() => toggle(m.id)}
              className={cn(
                "border-2 rounded-lg p-4 text-center transition",
                on ? "border-accent bg-accent/10" : "border-border hover:border-primary/40",
              )}>
              <div className="text-2xl">{m.icon}</div>
              <div className="text-sm font-medium mt-1">{m.label}</div>
            </button>
          );
        })}
      </div>
      {draft.travel_modes.includes("flight") && (
        <div>
          <Label>Flight Class</Label>
          <Select value={draft.travel_flight_class || ""} onValueChange={(v) => set({ travel_flight_class: v })}>
            <SelectTrigger><SelectValue placeholder="Economy / Business" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Economy">Economy</SelectItem>
              <SelectItem value="Premium Economy">Premium Economy</SelectItem>
              <SelectItem value="Business">Business</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {draft.travel_modes.includes("train") && (
        <div>
          <Label>Train Class</Label>
          <Select value={draft.travel_train_class || ""} onValueChange={(v) => set({ travel_train_class: v })}>
            <SelectTrigger><SelectValue placeholder="AC 1 / 2 / 3 / Sleeper" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AC 1">AC 1</SelectItem>
              <SelectItem value="AC 2">AC 2</SelectItem>
              <SelectItem value="AC 3">AC 3</SelectItem>
              <SelectItem value="Sleeper">Sleeper</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STEP 9 — Routing
// ============================================================
function Step9({ draft, set }: StepProps) {
  const d = useDB();
  // ensure routing length matches nights + 1
  useEffect(() => {
    const need = draft.nights + 1;
    if (draft.routing.length !== need) {
      const rows: RoutingDay[] = [];
      for (let i = 0; i < need; i++) {
        const existing = draft.routing[i];
        rows.push(existing || {
          day: i + 1,
          date: addDaysISO(draft.start_date, i),
          city_id: "",
          program: "",
          program_mode: "text",
          overnight: i < need - 1,
        });
        rows[i].day = i + 1;
        rows[i].date = addDaysISO(draft.start_date, i);
        rows[i].overnight = i < need - 1;
      }
      writeDraft({ ...draft, routing: rows });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.nights, draft.start_date]);

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
              const fromDefault = i === 0
                ? draft.departure_city
                : cityName(draft.routing[i - 1]?.city_id || "") || draft.routing[i - 1]?.to_city || "";
              const weekday = draft.has_dates !== false && r.date
                ? new Date(r.date).toLocaleDateString("en-US", { weekday: "long" })
                : `Day ${r.day}`;
              return (
                <>
                <tr key={i} className="bg-white border-b border-[#E5E7EB] align-middle" style={{ minHeight: 56 }}>
                  <td className="p-2 font-semibold align-middle">Day {r.day}</td>
                  <td className="p-2 align-middle">
                    <Input className="h-8 text-xs" value={r.day_name || weekday}
                      onChange={(e) => updateRow(i, { day_name: e.target.value })} />
                  </td>
                  <td className="p-2 text-xs align-middle">
                    {draft.has_dates === false ? <span className="text-muted-foreground">—</span> : fmtDateShort(r.date)}
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
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={currentName || "From city…"}>{currentName || "Select"}</SelectValue></SelectTrigger>
                          <SelectContent>
                            {d.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </td>

                  <td className="p-2 align-middle w-[200px]">
                    {(() => {
                      const selected = (r.to_city_ids && r.to_city_ids.length > 0)
                        ? r.to_city_ids
                        : (r.to_city_id ? [r.to_city_id] : []);
                      const available = d.cities.filter((c) => !selected.includes(c.id));
                      const addCity = (v: string) => {
                        const next = Array.from(new Set([...selected, v]));
                        const primary = next[0];
                        const shouldMirror = !r.city_id || r.city_id === r.to_city_id || selected.length === 0;
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
                                <span key={id}
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                                  {cityName(id) || id}
                                  <button type="button" onClick={() => removeCity(id)}
                                    className="hover:text-destructive" title="Remove">
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <Select
                            value=""
                            onValueChange={addCity}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder={
                                selected.length === 0
                                  ? (isLast ? "Departure city…" : "Add destination…")
                                  : "+ Add another destination"
                              } />
                            </SelectTrigger>
                            <SelectContent>
                              {available.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {isLast && selected.length === 0 && (
                            <Input className="h-7 text-[11px] mt-1"
                              placeholder="or type departure city"
                              value={r.to_city && !r.to_city_id ? r.to_city : ""}
                              onChange={(e) => updateRow(i, { to_city: e.target.value })} />
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
                        onValueChange={(v) => updateRow(i, { city_id: v === OVERNIGHT_NONE ? "" : v })}
                      >
                        <SelectTrigger className="h-8"><SelectValue placeholder="Stay city…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OVERNIGHT_NONE}>— None —</SelectItem>
                          {d.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="p-2 align-middle w-[110px]">
                    <div className="flex gap-1">
                      <Select value={r.travel_by || ""} onValueChange={(v) => updateRow(i, { travel_by: v as RoutingDay["travel_by"], transport_expanded: true })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mode" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Road">Road</SelectItem>
                          <SelectItem value="Train">Train</SelectItem>
                          <SelectItem value="Flight">Flight</SelectItem>
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
                          onClick={() => updateRow(i, { transport_expanded: !r.transport_expanded })}
                          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md border hover:bg-muted"
                        >
                          {r.transport_expanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-2 align-middle w-[240px]">
                    {(() => {
                      const toIds = (r.to_city_ids && r.to_city_ids.length > 0)
                        ? r.to_city_ids
                        : (r.to_city_id ? [r.to_city_id] : []);
                      const fromName = r.from_city ?? fromDefault;
                      const fromId = d.cities.find((c) => c.name === fromName)?.id || "";
                      const allIds: string[] = [];
                      if (fromId) allIds.push(fromId);
                      toIds.forEach((id) => { if (id && !allIds.includes(id)) allIds.push(id); });
                      if (r.city_id && !allIds.includes(r.city_id)) allIds.push(r.city_id);
                      const getTourOptionsForCity = (routingCityId: string) => {
                        if (!routingCityId) return [] as Array<{ id: string; title: string }>;
                        const cityNameRaw = d.cities.find((c) => c.id === routingCityId)?.name ?? "";
                        const normalized = cityNameRaw.trim().toLowerCase();
                        if (!normalized) return [] as Array<{ id: string; title: string }>;
                        const destCity = d.destination_cities.find(
                          (c) => c.name.trim().toLowerCase() === normalized
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
                        return <span className="text-[11px] text-muted-foreground italic">Set FROM/TO first</span>;
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
                                    <span className="text-muted-foreground truncate w-[64px]" title={nm}>{nm}</span>
                                    <span className="flex-1 truncate">
                                      {selected.length === 0
                                        ? (cityTours.length ? "Select tours…" : "No tours")
                                        : `${selected.length} tour${selected.length === 1 ? "" : "s"}`}
                                    </span>
                                    <ChevronDown className="h-3 w-3 shrink-0" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-72 p-2 max-h-72 overflow-auto">
                                  {cityTours.length === 0 ? (
                                    <div className="text-xs text-muted-foreground p-2">
                                      No tours defined for {nm}.
                                    </div>
                                  ) : cityTours.map((tour) => (
                                    <label key={tour.id} className="flex items-start gap-2 py-1 px-1 rounded hover:bg-muted cursor-pointer text-xs">
                                      <Checkbox
                                        checked={selected.includes(tour.title)}
                                        onCheckedChange={() => toggle(cid, tour.title)}
                                        className="mt-0.5"
                                      />
                                      <span className="flex-1">{tour.title}</span>
                                    </label>
                                  ))}
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
                          updateRow(i, { transport_details: { ...(r.transport_details || {}), ...patch } })
                        }
                        defaultFrom={r.from_city ?? fromDefault}
                        defaultTo={cityName(r.to_city_id || r.city_id) || r.to_city || ""}
                        defaultDate={r.date}
                      />
                    </td>
                  </tr>
                )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Per-day transport details panel — mirrors the fields available in Step 10 (Transport)
// per travel mode. Purely UI/data capture; does not affect costing.
function DayTransportPanel({
  mode, details, onChange, defaultFrom, defaultTo, defaultDate,
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
        <F label="Flight Class"><Input className={cls} value={details.flight_class || ""} onChange={(e) => onChange({ flight_class: e.target.value })} placeholder="Economy / Business" /></F>
        <F label="Airline"><Input className={cls} value={details.airline || ""} onChange={(e) => onChange({ airline: e.target.value })} placeholder="IndiGo" /></F>
        <F label="Flight Number"><Input className={cls} value={details.flight_number || ""} onChange={(e) => onChange({ flight_number: e.target.value })} placeholder="6E-214" /></F>
        <F label="PNR / Ref"><Input className={cls} value={details.remarks || ""} onChange={(e) => onChange({ remarks: e.target.value })} placeholder="Optional" /></F>
        <F label="From City"><Input className={cls} value={details.from_city ?? defaultFrom ?? ""} onChange={(e) => onChange({ from_city: e.target.value })} /></F>
        <F label="To City"><Input className={cls} value={details.to_city ?? defaultTo ?? ""} onChange={(e) => onChange({ to_city: e.target.value })} /></F>
        <F label="Departure Date"><Input type="date" className={cls} value={details.departure_date ?? defaultDate ?? ""} onChange={(e) => onChange({ departure_date: e.target.value })} /></F>
        <F label="Departure Time"><Input type="time" className={cls} value={details.departure_time || ""} onChange={(e) => onChange({ departure_time: e.target.value })} /></F>
        <F label="Arrival Date"><Input type="date" className={cls} value={details.arrival_date ?? defaultDate ?? ""} onChange={(e) => onChange({ arrival_date: e.target.value })} /></F>
        <F label="Arrival Time"><Input type="time" className={cls} value={details.arrival_time || ""} onChange={(e) => onChange({ arrival_time: e.target.value })} /></F>
      </div>
    );
  }

  if (mode === "Train") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <F label="Train Name"><Input className={cls} value={details.train_name || ""} onChange={(e) => onChange({ train_name: e.target.value })} placeholder="Vande Bharat" /></F>
        <F label="Train Number"><Input className={cls} value={details.train_number || ""} onChange={(e) => onChange({ train_number: e.target.value })} placeholder="20171" /></F>
        <F label="Coach / Class"><Input className={cls} value={details.coach_class || ""} onChange={(e) => onChange({ coach_class: e.target.value })} placeholder="CC / 3A / SL" /></F>
        <F label="Remarks"><Input className={cls} value={details.remarks || ""} onChange={(e) => onChange({ remarks: e.target.value })} /></F>
        <F label="Boarding Station"><Input className={cls} value={details.boarding_station ?? defaultFrom ?? ""} onChange={(e) => onChange({ boarding_station: e.target.value })} /></F>
        <F label="Destination Station"><Input className={cls} value={details.destination_station ?? defaultTo ?? ""} onChange={(e) => onChange({ destination_station: e.target.value })} /></F>
        <F label="Departure Date"><Input type="date" className={cls} value={details.departure_date ?? defaultDate ?? ""} onChange={(e) => onChange({ departure_date: e.target.value })} /></F>
        <F label="Departure Time"><Input type="time" className={cls} value={details.departure_time || ""} onChange={(e) => onChange({ departure_time: e.target.value })} /></F>
        <F label="Arrival Date"><Input type="date" className={cls} value={details.arrival_date ?? defaultDate ?? ""} onChange={(e) => onChange({ arrival_date: e.target.value })} /></F>
        <F label="Arrival Time"><Input type="time" className={cls} value={details.arrival_time || ""} onChange={(e) => onChange({ arrival_time: e.target.value })} /></F>
      </div>
    );
  }

  if (mode === "Road") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <F label="Vehicle Type"><Input className={cls} value={details.vehicle_type || ""} onChange={(e) => onChange({ vehicle_type: e.target.value })} placeholder="Tempo Traveller" /></F>
        <F label="Vehicle Name / Model"><Input className={cls} value={details.vehicle_name || ""} onChange={(e) => onChange({ vehicle_name: e.target.value })} placeholder="Innova Crysta" /></F>
        <F label="Reporting Time"><Input type="time" className={cls} value={details.reporting_time || ""} onChange={(e) => onChange({ reporting_time: e.target.value })} /></F>
        <F label="Pickup City"><Input className={cls} value={details.pickup_city ?? defaultFrom ?? ""} onChange={(e) => onChange({ pickup_city: e.target.value })} /></F>
        <F label="Drop City"><Input className={cls} value={details.drop_city ?? defaultTo ?? ""} onChange={(e) => onChange({ drop_city: e.target.value })} /></F>
        <F label="Remarks"><Input className={cls} value={details.remarks || ""} onChange={(e) => onChange({ remarks: e.target.value })} /></F>
      </div>
    );
  }

  if (mode === "Self Drive") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <F label="Vehicle Category"><Input className={cls} value={details.vehicle_category || ""} onChange={(e) => onChange({ vehicle_category: e.target.value })} placeholder="SUV / Hatchback" /></F>
        <F label="Pickup Location"><Input className={cls} value={details.pickup_location ?? defaultFrom ?? ""} onChange={(e) => onChange({ pickup_location: e.target.value })} /></F>
        <F label="Drop Location"><Input className={cls} value={details.drop_location ?? defaultTo ?? ""} onChange={(e) => onChange({ drop_location: e.target.value })} /></F>
        <F label="Pickup Time"><Input type="time" className={cls} value={details.pickup_time || ""} onChange={(e) => onChange({ pickup_time: e.target.value })} /></F>
        <F label="Return Time"><Input type="time" className={cls} value={details.return_time || ""} onChange={(e) => onChange({ return_time: e.target.value })} /></F>
        <F label="Remarks"><Input className={cls} value={details.remarks || ""} onChange={(e) => onChange({ remarks: e.target.value })} /></F>
      </div>
    );
  }

  // Helicopter / Boat / Walk / Custom — lightweight capture
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <F label="From"><Input className={cls} value={details.from_city ?? defaultFrom ?? ""} onChange={(e) => onChange({ from_city: e.target.value })} /></F>
      <F label="To"><Input className={cls} value={details.to_city ?? defaultTo ?? ""} onChange={(e) => onChange({ to_city: e.target.value })} /></F>
      <F label="Departure Time"><Input type="time" className={cls} value={details.departure_time || ""} onChange={(e) => onChange({ departure_time: e.target.value })} /></F>
      <F label="Arrival Time"><Input type="time" className={cls} value={details.arrival_time || ""} onChange={(e) => onChange({ arrival_time: e.target.value })} /></F>
      <div className="md:col-span-4">
        <F label="Remarks"><Input className={cls} value={details.remarks || ""} onChange={(e) => onChange({ remarks: e.target.value })} /></F>
      </div>
    </div>
  );
}


// ============================================================
// STEP 10 — Transport
// ============================================================


// ============================================================
// Shared helpers for day-wise sync (Steps 11/12/13)
// ============================================================



// ============================================================
// STEP 10 (Activities) — day-wise, city-grouped, with per-pax breakdown
// ============================================================




// ============================================================
// STEP 11 — Entrances (day-wise table) & STEP 12 — Guide (day-wise table)
// ============================================================

type CityRef = { id: string; name: string };




// ============================================================
// STEP 12 — Guide (day-wise table)
// ============================================================



// ============================================================
// STEP 14 — Miscellaneous
// ============================================================



// ============================================================
// STEP 15 — Accommodation
// ============================================================
const WIZARD_HOTEL_CATEGORIES = [
  "Home Stay",
  "Excellent Budget",
  "3 Star",
  "3 Star Deluxe",
  "4 Star",
  "4 Star Superior",
  "5 Star",
  "5 Star Deluxe",
  "Heritage",
  "Experiential",
] as const;


// ------------------------------------------------------------
// Per-option Inclusions & Exclusions editor (Step 15).
// ------------------------------------------------------------


// ------------------------------------------------------------
// Live cost preview under each Option tab in Step 15.
// Read-only rooms-only (Net, GST, Net+GST) with per-day warnings.
// ------------------------------------------------------------

// ============================================================
// Step 15 — Per-Person Room Allocation
// ============================================================
const PERSON_ROOM_TYPES: { value: PersonRoomType; label: string; shares: number }[] = [
  { value: "single", label: "Single Room", shares: 0 },
  { value: "double", label: "Double Sharing", shares: 1 },
  { value: "triple", label: "Triple Sharing", shares: 2 },
  { value: "extra_bed", label: "Extra Bed", shares: 0 },
  { value: "cwb", label: "Child With Bed", shares: 0 },
];


// ------------------------------------------------------------
// Live per-person cost preview (Step 15).
// ------------------------------------------------------------



// ============================================================
// STEP 16 — Costing Variations
// ============================================================

// ============================================================
// Group Costing block (Step 16, GIT tours)
// ============================================================



// ============================================================
// STEP 17 — Final Costing
// ============================================================

// ------------------------------------------------------------
// Shared per-person summary card used in Step 16 & 17.
// Only renders options that use custom room allocation.
// ------------------------------------------------------------






// ============================================================
// STEP 18 — Optionals + Actions
// ============================================================
function Step18({ draft, set }: StepProps) {
  const d = useDB();
  const user = useAuth();
  const [savedQuote, setSavedQuote] = useState<SavedQuote | null>(null);

  const routingCities = new Set(draft.routing.map((r) => d.cities.find((c) => c.id === (r.to_city_id || r.city_id))?.name).filter(Boolean) as string[]);
  const suggActs = d.activities.filter((a) => {
    if (!a.is_active) return false;
    if (draft.activities.some((x) => x.activity_id === a.id)) return false;
    const dest = d.activity_destinations.find((x) => x.id === a.destination_id)?.name;
    return dest && routingCities.has(dest);
  });
  const cityIds = new Set(d.entrance_cities.filter((c) => routingCities.has(c.name)).map((c) => c.id));
  const suggEnts = d.entrance_sites.filter((s) => s.is_active && cityIds.has(s.city_id) && !draft.entrances.some((x) => x.site_id === s.id));

  const totals = useMemo(() => draft.hotel_options.map((o) => computeOption(draft, o, d)), [draft, d]);

  function buildSavedQuote(): SavedQuote {
    const recIdx = Math.max(0, draft.hotel_options.findIndex((o) => o.key === draft.recommended_option));
    const rec = totals[recIdx] || totals[0];
    // Build minimal legacy itinerary from recommended option
    const recOpt = draft.hotel_options[recIdx];
    const itinerary = draft.routing.map((day) => {
      const sel = recOpt?.selections.find((s) => s.city_id === day.city_id);
      const hotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id) : null;
      const room = sel ? d.room_categories.find((r) => r.id === sel.room_id) : null;
      const cityName = d.cities.find((c) => c.id === day.city_id)?.name || "—";
      const plan = sel ? findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, day.date) : null;
      const dbl = plan?.double_rate || 0;
      const sgl = plan?.single_rate || 0;
      const trp = dbl + (plan?.extra_bed_rate || 0);
      const gr = gstRateFor;
      return {
        day_number: day.day, date: day.date, city: cityName,
        hotel_name: hotel?.name || "—", hotel_category: hotel?.hotel_category || "—",
        room_category: room?.name || "—", meal_plan: sel?.meal_plan || "CP",
        season_label: plan?.season_label || "—",
        validity_start: plan?.validity_start || "", validity_end: plan?.validity_end || "",
        rates: {
          sgl_net: sgl, sgl_gst_rate: gr(sgl), sgl_gst_amt: sgl * gr(sgl), sgl_total: sgl * (1 + gr(sgl)),
          dbl_net: dbl, dbl_gst_rate: gr(dbl), dbl_gst_amt: dbl * gr(dbl), dbl_total: dbl * (1 + gr(dbl)),
          trp_net: trp, trp_gst_rate: gr(trp), trp_gst_amt: trp * gr(trp), trp_total: trp * (1 + gr(trp)),
        },
        lunch_rate: plan?.lunch_rate || 0, dinner_rate: plan?.dinner_rate || 0,
      };
    });

    const addonsBlock = {
      travels: draft.transport.map((t) => {
        const to = d.travel_options.find((x) => x.id === t.travel_id);
        return { name: to?.vehicle_type || "—", days: t.days, vehicles: t.vehicles, rate_per_day: t.rate, total: t.rate * t.days * t.vehicles };
      }),
      miscellaneous: draft.misc.map((m) => {
        const mo = m.item_id ? d.miscellaneous_items.find((x) => x.id === m.item_id) : null;
        return { name: mo?.name || m.custom_name || "—", pax: m.qty, rate: m.rate, unit: m.unit, total: m.qty * m.rate };
      }),
      guide: draft.guides.map((g) => {
        const go = d.guides.find((x) => x.id === g.guide_id);
        return { name: go?.name || "—", type: go?.guide_type || "—", days: g.days, count: g.guides, rate_per_day: g.rate, total: g.rate * g.days * g.guides };
      }),
      entrances: draft.entrances.map((e) => {
        const so = e.site_id ? d.entrance_sites.find((x) => x.id === e.site_id) : null;
        const cityName = so ? d.entrance_cities.find((c) => c.id === so.city_id)?.name || "—" : "—";
        return {
          site_name: so?.site_name || e.custom_name || "—", city: cityName,
          indian_pax: e.indian_pax, indian_rate: e.indian_rate,
          foreigner_pax: e.foreign_pax, foreigner_rate: e.foreign_rate,
          total: e.indian_pax * e.indian_rate + e.foreign_pax * e.foreign_rate,
        };
      }),
      activities: [...draft.activities, ...draft.optionals].map((a) => {
        const ao = a.activity_id ? d.activities.find((x) => x.id === a.activity_id) : null;
        const dest = ao ? d.activity_destinations.find((x) => x.id === ao.destination_id)?.name || "—" : "—";
        return { name: ao?.activity_name || a.custom_name || "—", destination: dest, pricing_type: ao?.pricing_type || "custom", qty: a.qty, rate: a.rate, total: a.qty * a.rate };
      }),
      addons_total: computeAddonsTotal(draft),
    };

    const q: SavedQuote = {
      id: uid(),
      quote_number: nextQuoteNumber(),
      saved_at: new Date().toISOString(),
      saved_by: user?.name || "Unknown",
      tour_title: draft.program_name || `${draft.query_type} Tour`,
      cities: Array.from(routingCities),
      total_nights: draft.nights,
      travel_start: draft.start_date,
      travel_end: addDaysISO(draft.start_date, draft.nights),
      itinerary,
      addons: addonsBlock,
      inclusions: {
        accommodation_nights: draft.nights,
        breakfast_count: draft.nights,
        lunch_count: 0, dinner_count: 0,
        travels_included: draft.transport.length > 0,
        guide_included: draft.guides.length > 0,
      },
      markup_percent: draft.markup_percent,
      totals: {
        room_net_sgl: rec.room_net_sgl, room_net_dbl: rec.room_net_dbl, room_net_trp: rec.room_net_trp,
        gst_rooms_sgl: rec.gst_rooms_sgl, gst_rooms_dbl: rec.gst_rooms_dbl, gst_rooms_trp: rec.gst_rooms_trp,
        addons_total: rec.addons_total,
        markup_sgl: rec.markup_sgl, markup_dbl: rec.markup_dbl, markup_trp: rec.markup_trp,
        gst_markup_sgl: rec.gst5_sgl, gst_markup_dbl: rec.gst5_dbl, gst_markup_trp: rec.gst5_trp,
        grand_sgl: rec.grand_sgl, grand_dbl: rec.grand_dbl, grand_trp: rec.grand_trp,
      },
      include_sgl: true, include_dbl: true, include_trp: true,
      allocations: recOpt && optionUsesCustomAllocation(recOpt)
        ? (() => {
            const rows = computePersonTotals(draft, recOpt, d);
            const nameById = new Map(rows.map((r) => [r.person_id, r.label]));
            return rows.map((r) => ({
              label: r.label,
              room_type_label: personRoomTypeLabel(r.room_type, r.sharing_with)
                + (r.sharing_with.length ? ` (w/ ${r.sharing_with.map((id) => nameById.get(id) || `#${id}`).join(", ")})` : ""),
              room_net: r.room_net,
              room_gst: r.room_gst,
              room_total: r.room_total,
              shared_addons: r.shared_addons,
              markup_plus_gst: r.markup + r.gst5,
              grand_total: r.grand_total,
            }));
          })()
        : undefined,
      ...(isGroupTour(draft) && recOpt ? (() => {
        const pax = Math.max(1, totalPax(draft));
        const dbl = computeGroupOption(draft, recOpt, d, autoDoubleMix(pax));
        const trp = computeGroupOption(draft, recOpt, d, autoTripleMix(pax));
        const cust = draft.group_room_mix ? computeGroupOption(draft, recOpt, d, draft.group_room_mix) : null;
        const rows = [
          { arrangement: "Double Sharing", rooms_label: mixLabel(dbl.mix), total_package: dbl.grand_total, per_person: dbl.per_person, pax_covered: dbl.pax_covered },
          { arrangement: "Triple Sharing", rooms_label: mixLabel(trp.mix), total_package: trp.grand_total, per_person: trp.per_person, pax_covered: trp.pax_covered },
        ];
        if (cust) rows.push({ arrangement: "Custom Mix", rooms_label: mixLabel(cust.mix), total_package: cust.grand_total, per_person: cust.per_person, pax_covered: cust.pax_covered });
        return { is_group: true, group_total_pax: pax, group_rows: rows };
      })() : {}),
    };

    return q;
  }


  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Optional Add-Ons</h2>
      <p className="text-sm text-muted-foreground">Items not yet included — suggest to guest.</p>

      <Card className="p-4">
        <div className="section-label mb-2">Suggested Activities</div>
        {suggActs.length === 0 ? <p className="text-xs text-muted-foreground">All activities already included.</p> : (
          <ul className="space-y-2">
            {suggActs.map((a) => (
              <li key={a.id} className="flex justify-between items-center text-sm">
                <span>{a.activity_name} · {inr(a.price)}</span>
                <Button size="sm" variant="outline" onClick={() => set({
                  optionals: [...draft.optionals, { id: uid(), activity_id: a.id, qty: 1, rate: a.price }],
                })}>+ Add to Quote</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="section-label mb-2">Suggested Entrances</div>
        {suggEnts.length === 0 ? <p className="text-xs text-muted-foreground">All entrances already included.</p> : (
          <ul className="space-y-2">
            {suggEnts.map((e) => (
              <li key={e.id} className="flex justify-between items-center text-sm">
                <span>{e.site_name} · Indian ₹{e.indian_rate}</span>
                <Button size="sm" variant="outline" onClick={() => set({
                  entrances: [...draft.entrances, { id: uid(), site_id: e.id, indian_pax: totalPax(draft), indian_rate: e.indian_rate, foreign_pax: 0, foreign_rate: e.foreigner_rate }],
                })}>+ Add to Quote</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CustomAdd label="Custom Optional" onAdd={(name, rate) => set({
        optionals: [...draft.optionals, { id: uid(), custom_name: name, qty: 1, rate }],
      })} />
      {draft.optionals.map((x) => {
        const name = x.custom_name || d.activities.find((a) => a.id === x.activity_id)?.activity_name || "—";
        return (
          <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
            <span>Optional: {name}</span>
            <span>{inr(x.qty * x.rate)}
              <button className="ml-2 text-destructive" onClick={() => set({ optionals: draft.optionals.filter((y) => y.id !== x.id) })}>×</button>
            </span>
          </div>
        );
      })}

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="section-label mb-3">Final Actions</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => {
            const q = buildSavedQuote();
            persistQuote(q);
            clearDraft();
            setActiveWizard(null);
            toast.success(`Quote ${q.quote_number} saved.`);
            addNotification({
              kind: "success", category: "quote_saved",
              title: `Quote ${q.quote_number} saved`,
              message: `${q.tour_title} · ${q.total_nights}N · ${q.cities.join(" → ")}`,
              href: "/quotes",
            });
            setSavedQuote(q);
          }}>
            <Save className="h-4 w-4 mr-1.5" /> Save Quote
          </Button>
          <Button variant="outline" onClick={() => setSavedQuote(buildSavedQuote())}>
            <FileDown className="h-4 w-4 mr-1.5" /> Generate Quote PDF
          </Button>
          <Button variant="outline" onClick={async () => {
            const q = buildSavedQuote();
            const { exportQuoteExcel } = await import("@/lib/quotes-export");
            exportQuoteExcel(q);
            toast.success("Excel exported");
            addNotification({
              kind: "info", category: "export",
              title: "Excel exported",
              message: `${q.quote_number} — ${q.tour_title}`,
            });
          }}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => {
            setSavedQuote(buildSavedQuote());
            setTimeout(() => window.print(), 400);
          }}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
        </div>
      </Card>

      <QuoteViewerDialog quote={savedQuote} open={!!savedQuote} onClose={() => setSavedQuote(null)} />
    </div>
  );
}

// ============================================================
// Summary sidebar
// ============================================================
function SummarySidebar({ draft }: { draft: QuoteDraft }) {
  const d = useDB();
  const routingNames = draft.routing.filter((r) => r.overnight).map((r) => d.cities.find((c) => c.id === r.city_id)?.name).filter(Boolean).join(" → ");
  const running = useMemo(() => {
    const opt = draft.hotel_options[0];
    if (!opt || opt.selections.length === 0) return computeAddonsTotal(draft);
    return computeOption(draft, opt, d).grand_dbl;
  }, [draft, d]);
  const endDate = addDaysISO(draft.start_date, draft.nights);

  return (
    <div className="space-y-3">
      <Card className="p-4 sticky top-4">
        <div className="section-label mb-3">Live Summary</div>
        {draft.query_type && <Badge className="mb-2">{draft.query_type}</Badge>}
        <div className="space-y-2 text-sm">
          {draft.program_name && (<div><span className="text-muted-foreground text-xs">Tour</span><div className="font-medium">{draft.program_name}</div></div>)}
          <div><span className="text-muted-foreground text-xs">Dates</span>
            <div>
              {draft.query_type === "Brochure"
                ? (draft.brochure_validity_from && draft.brochure_validity_till
                    ? `${fmtDateShort(draft.brochure_validity_from)} – ${fmtDateShort(draft.brochure_validity_till)}`
                    : "Brochure validity")
                : draft.has_dates === false
                  ? "Day 1 → Day " + (draft.nights + 1)
                  : `${fmtDateShort(draft.start_date)} → ${fmtDateShort(endDate)}`}
            </div>
            <div className="text-xs text-muted-foreground">{draft.nights}N / {draft.nights + 1}D</div>
          </div>
          <div><span className="text-muted-foreground text-xs">Pax</span>
            <div>
              {draft.query_type === "Brochure"
                ? `${draft.pax_min}-${draft.pax_max} pax`
                : `${totalPax(draft)} (${draft.adults}A · ${draft.ss}SS · ${draft.children.length}C)`}
            </div>
          </div>
          {routingNames && (<div><span className="text-muted-foreground text-xs">Routing</span><div className="text-xs">{routingNames}</div></div>)}
          <div className="pt-2 border-t">
            <span className="text-muted-foreground text-xs">Running estimate (DBL)</span>
            <div className="text-lg font-bold text-primary">{inr(running)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// NEW STEP 3 — Pax + Tour Type (FIT/GIT auto for B2B/B2C, pax-range for Brochure)
// ============================================================
function StepTripBasics({ draft, set }: StepProps) {
  return (
    <div className="space-y-8">
      <StepPaxType draft={draft} set={set} />
      <div className="border-t pt-6"><StepDeparture draft={draft} set={set} /></div>
      <div className="border-t pt-6"><StepTravel draft={draft} set={set} /></div>
      <div className="border-t pt-6"><StepDuration draft={draft} set={set} /></div>
    </div>
  );
}

function StepPaxType({ draft, set }: StepProps) {
  const isBrochure = draft.query_type === "Brochure";
  const totPax = draft.adults + draft.ss + draft.children.length;
  const pricingPax = effectivePaxForPricing(draft);
  const autoTourType: "FIT" | "GIT" | "Brochure" = isBrochure ? "Brochure" : pricingPax <= 5 ? "FIT" : "GIT";
  // Persist auto-detected tour type into the draft (once when it changes)
  useEffect(() => {
    if (draft.tour_type !== autoTourType) set({ tour_type: autoTourType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <div><Label>Min Pax</Label><Input type="number" min={1} value={draft.pax_min ?? 1}
            onChange={(e) => set({ pax_min: Math.max(1, parseInt(e.target.value) || 1) })} /></div>
          <div><Label>Max Pax</Label><Input type="number" min={1} value={draft.pax_max ?? 1}
            onChange={(e) => set({ pax_max: Math.max(1, parseInt(e.target.value) || 1) })} /></div>
        </div>
        <p className="text-xs text-muted-foreground max-w-md">
          Costs for Activities / Guides / Miscellaneous can be entered with per-range prices in later steps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Pax & Tour Type</h2>
      <div className="flex items-center gap-3">
        <Badge className={cn("text-sm px-3 py-1",
          autoTourType === "FIT" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white")}>
          {autoTourType}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Auto-detected from pricing pax — 1-5 pax = FIT, 6+ = GIT.
        </span>
      </div>
      <Card className="p-4 space-y-3 max-w-lg">
        <div className="text-sm font-semibold">Pax</div>
        <PaxRow label="Adults" value={draft.adults} onChange={(v) => set({ adults: v })} />
        <PaxRow label="SS (Senior/Special)" value={draft.ss} onChange={(v) => set({ ss: v })} />
        <PaxRow label="Children" value={draft.children.length} onChange={(v) => {
          const cur = draft.children.length;
          if (v > cur) set({ children: [...draft.children, ...Array(v - cur).fill({ age: 5 })] });
          else set({ children: draft.children.slice(0, Math.max(0, v)) });
        }} />
        {draft.children.map((c, i) => (
          <div key={i} className="pl-8 flex items-center gap-3">
            <span className="text-sm">Child {i + 1}: Age</span>
            <Input type="number" min={0} max={17} value={c.age} className="w-20"
              onChange={(e) => {
                const next = [...draft.children];
                next[i] = { age: parseInt(e.target.value) || 0 };
                set({ children: next });
              }} />
            <span className="text-xs text-muted-foreground">years</span>
          </div>
        ))}
        <div className="pt-2 border-t text-sm font-semibold">Total Pax: {totPax}</div>
        <div className="pt-2 border-t space-y-1">
          <Label className="text-xs">Pax Range (pricing slab override)</Label>
          <Select
            value={draft.pax_range ?? "auto"}
            onValueChange={(v) => set({ pax_range: v as QuoteDraft["pax_range"] })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto — actual pax ({totPax || 1})</SelectItem>
              <SelectItem value="1-9">1–9 pax</SelectItem>
              <SelectItem value="5-14">5–14 pax</SelectItem>
              <SelectItem value="15-24">15–24 pax</SelectItem>
              <SelectItem value="25+">25+ pax</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[10px] text-muted-foreground">
            Current pricing pax: {pricingPax}. Guide, activities, misc, transport filters and group hotel room mixes use this slab.
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// NEW STEP 4 — Departure (Brochure restricted list)
// ============================================================
function StepDeparture({ draft, set }: StepProps) {
  if (draft.query_type === "Brochure") {
    return (
      <div className="space-y-4 max-w-md">
        <h2 className="text-lg font-semibold">Ex (Departure Point)</h2>
        <Select value={draft.departure_city} onValueChange={(v) => set({ departure_city: v })}>
          <SelectTrigger><SelectValue placeholder="Choose Ex point…" /></SelectTrigger>
          <SelectContent>
            {BROCHURE_EX_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Brochure ex-points are limited to standard MP gateways.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-lg font-semibold">Guest Travelling From</h2>
      <CityCombobox
        value={draft.departure_city}
        onChange={(v) => set({ departure_city: v })}
      />
      <p className="text-xs text-muted-foreground">
        Search Indian cities or pick from Other Countries. Existing typed values are preserved.
      </p>
    </div>
  );
}

function CityCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const d = useDB();
  const [open, setOpen] = useState(false);

  // Merge db cities + curated Indian list, dedupe (case-insensitive), sort.
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
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="w-full justify-between font-normal">
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
                <CommandItem key={`in-${c}`} value={c} onSelect={() => { onChange(c); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Other Countries">
              {INTERNATIONAL_CITIES.map((c) => (
                <CommandItem key={`int-${c}`} value={c} onSelect={() => { onChange(c); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
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
// NEW STEP 5 — Mode of Travel (with flight/train arrival + departure details)
// Brochure: skipped
// ============================================================
function StepTravel({ draft, set }: StepProps) {
  const toggle = (id: string) => {
    const has = draft.travel_modes.includes(id);
    set({ travel_modes: has ? draft.travel_modes.filter((x) => x !== id) : [...draft.travel_modes, id] });
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
      <h2 className="text-lg font-semibold">Mode of Travel</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TRAVEL_MODES.map((m) => {
          const on = draft.travel_modes.includes(m.id);
          return (
            <button key={m.id} onClick={() => toggle(m.id)}
              className={cn(
                "border-2 rounded-lg p-4 text-center transition",
                on ? "border-accent bg-accent/10" : "border-border hover:border-primary/40",
              )}>
              <div className="text-2xl">{m.icon}</div>
              <div className="text-sm font-medium mt-1">{m.label}</div>
            </button>
          );
        })}
      </div>

      {draft.travel_modes.includes("flight") && (
        <Card className="p-4 space-y-3">
          <div className="font-semibold text-sm flex items-center gap-2">✈ Flight Details</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Class</Label>
              <Select value={draft.travel_flight_class || ""} onValueChange={(v) => set({ travel_flight_class: v })}>
                <SelectTrigger><SelectValue placeholder="Economy / Business" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Economy">Economy</SelectItem>
                  <SelectItem value="Premium Economy">Premium Economy</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Arrival Flight</div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Flight No" value={draft.arrival_flight?.flight_no || ""}
                  onChange={(e) => set({ arrival_flight: { ...(draft.arrival_flight || {}), flight_no: e.target.value } })} />
                <Input placeholder="From City" value={draft.arrival_flight?.from_city || ""}
                  onChange={(e) => set({ arrival_flight: { ...(draft.arrival_flight || {}), from_city: e.target.value } })} />
                <Input type="date" value={draft.arrival_flight?.date || ""}
                  onChange={(e) => set({ arrival_flight: { ...(draft.arrival_flight || {}), date: e.target.value } })} />
                <Input type="time" value={draft.arrival_flight?.time || ""}
                  onChange={(e) => set({ arrival_flight: { ...(draft.arrival_flight || {}), time: e.target.value } })} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Departure Flight</div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Flight No" value={draft.departure_flight?.flight_no || ""}
                  onChange={(e) => set({ departure_flight: { ...(draft.departure_flight || {}), flight_no: e.target.value } })} />
                <Input placeholder="To City" value={draft.departure_flight?.to_city || ""}
                  onChange={(e) => set({ departure_flight: { ...(draft.departure_flight || {}), to_city: e.target.value } })} />
                <Input type="date" value={draft.departure_flight?.date || ""}
                  onChange={(e) => set({ departure_flight: { ...(draft.departure_flight || {}), date: e.target.value } })} />
                <Input type="time" value={draft.departure_flight?.time || ""}
                  onChange={(e) => set({ departure_flight: { ...(draft.departure_flight || {}), time: e.target.value } })} />
              </div>
            </div>
          </div>
        </Card>
      )}

      {draft.travel_modes.includes("train") && (
        <Card className="p-4 space-y-3">
          <div className="font-semibold text-sm flex items-center gap-2">🚂 Train Details</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Class</Label>
              <Select value={draft.travel_train_class || ""} onValueChange={(v) => set({ travel_train_class: v })}>
                <SelectTrigger><SelectValue placeholder="AC 1 / 2 / 3 / Sleeper" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AC 1">AC 1</SelectItem>
                  <SelectItem value="AC 2">AC 2</SelectItem>
                  <SelectItem value="AC 3">AC 3</SelectItem>
                  <SelectItem value="Sleeper">Sleeper</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Arrival Train</div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Train Name / No" value={draft.arrival_train?.train_name || ""}
                  onChange={(e) => set({ arrival_train: { ...(draft.arrival_train || {}), train_name: e.target.value } })} />
                <Input placeholder="From City" value={draft.arrival_train?.from_city || ""}
                  onChange={(e) => set({ arrival_train: { ...(draft.arrival_train || {}), from_city: e.target.value } })} />
                <Input type="date" value={draft.arrival_train?.date || ""}
                  onChange={(e) => set({ arrival_train: { ...(draft.arrival_train || {}), date: e.target.value } })} />
                <Input type="time" value={draft.arrival_train?.time || ""}
                  onChange={(e) => set({ arrival_train: { ...(draft.arrival_train || {}), time: e.target.value } })} />
                <Input placeholder="PNR" value={draft.arrival_train?.pnr || ""}
                  onChange={(e) => set({ arrival_train: { ...(draft.arrival_train || {}), pnr: e.target.value } })} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Departure Train</div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Train Name / No" value={draft.departure_train?.train_name || ""}
                  onChange={(e) => set({ departure_train: { ...(draft.departure_train || {}), train_name: e.target.value } })} />
                <Input placeholder="To City" value={draft.departure_train?.to_city || ""}
                  onChange={(e) => set({ departure_train: { ...(draft.departure_train || {}), to_city: e.target.value } })} />
                <Input type="date" value={draft.departure_train?.date || ""}
                  onChange={(e) => set({ departure_train: { ...(draft.departure_train || {}), date: e.target.value } })} />
                <Input type="time" value={draft.departure_train?.time || ""}
                  onChange={(e) => set({ departure_train: { ...(draft.departure_train || {}), time: e.target.value } })} />
                <Input placeholder="PNR" value={draft.departure_train?.pnr || ""}
                  onChange={(e) => set({ departure_train: { ...(draft.departure_train || {}), pnr: e.target.value } })} />
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// NEW STEP 6 — Duration (with/without dates for B2B/B2C, validity for Brochure)
// ============================================================
function StepDuration({ draft, set }: StepProps) {
  const isBrochure = draft.query_type === "Brochure";
  const hasDates = draft.has_dates !== false;
  const endDate = addDaysISO(draft.start_date, draft.nights);

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold">Duration</h2>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div><Label>Nights</Label>
          <Input type="number" min={1} value={draft.nights}
            onChange={(e) => set({ nights: Math.max(1, parseInt(e.target.value) || 1) })} />
        </div>
        <div><Label>Days</Label><Input value={draft.nights + 1} readOnly className="bg-muted" /></div>
      </div>

      {isBrochure ? (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Brochure Validity Period</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valid From</Label>
              <Input type="date" value={draft.brochure_validity_from || ""}
                onChange={(e) => set({ brochure_validity_from: e.target.value })} /></div>
            <div><Label>Valid Till</Label>
              <Input type="date" value={draft.brochure_validity_till || ""}
                onChange={(e) => set({ brochure_validity_till: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            Programs use Day 1, Day 2… labels instead of calendar dates.
          </p>
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <RadioGroup value={hasDates ? "yes" : "no"} onValueChange={(v) => set({ has_dates: v === "yes" })}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="hd-yes" />
              <label htmlFor="hd-yes" className="text-sm font-medium cursor-pointer">With Dates</label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="hd-no" />
              <label htmlFor="hd-no" className="text-sm font-medium cursor-pointer">Without Dates (Day 1, Day 2…)</label>
            </div>
          </RadioGroup>
          {hasDates && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div><Label>Tour Starting Date</Label>
                <Input type="date" value={draft.start_date}
                  onChange={(e) => set({ start_date: e.target.value })} /></div>
              <div><Label>Tour Ending Date</Label>
                <Input value={fmtDateShort(endDate)} readOnly className="bg-muted" /></div>
            </div>
          )}
        </Card>
      )}

      <div className="p-4 bg-primary/5 rounded-lg text-center">
        <div className="text-2xl font-bold text-primary">{draft.nights} Nights / {draft.nights + 1} Days</div>
      </div>
    </div>
  );
}

// ============================================================
// NEW STEP 8 — Create Route (Gate) — summary + Generate Routing button
// ============================================================
function StepCreateRoute({ draft, set }: StepProps) {
  const totPax = draft.adults + draft.ss + draft.children.length;
  const generate = () => {
    const need = draft.nights + 1;
    const rows: RoutingDay[] = [];
    for (let i = 0; i < need; i++) {
      const existing = draft.routing[i];
      rows.push(existing || {
        day: i + 1,
        date: draft.has_dates === false ? "" : addDaysISO(draft.start_date, i),
        day_name: `Day ${i + 1}`,
        city_id: "",
        program: "",
        program_mode: "text",
        overnight: i < need - 1,
      });
      rows[i].day = i + 1;
      rows[i].date = draft.has_dates === false ? "" : addDaysISO(draft.start_date, i);
      rows[i].day_name = `Day ${i + 1}`;
      rows[i].overnight = i < need - 1;
    }
    set({ routing: rows });
    toast.success(`Generated ${need} day rows.`);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold">Ready to Create Routing</h2>
      <Card className="p-5 space-y-3">
        <div className="text-sm font-semibold text-muted-foreground uppercase">Summary</div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-muted-foreground">Query</div><div className="font-medium">{draft.query_type}</div>
          <div className="text-muted-foreground">Tour Type</div><div className="font-medium">{draft.tour_type || "—"}</div>
          <div className="text-muted-foreground">Pax</div>
          <div className="font-medium">
            {draft.query_type === "Brochure"
              ? `${draft.pax_min}-${draft.pax_max}`
              : `${totPax} (${draft.adults}A + ${draft.ss}SS + ${draft.children.length}C)`}
          </div>
          <div className="text-muted-foreground">Duration</div><div className="font-medium">{draft.nights}N / {draft.nights + 1}D</div>
          <div className="text-muted-foreground">Departure</div><div className="font-medium">{draft.departure_city || "—"}</div>
          <div className="text-muted-foreground">Travel</div>
          <div className="font-medium">{draft.query_type === "Brochure" ? "N/A" : (draft.travel_modes.join(", ") || "—")}</div>
          <div className="text-muted-foreground">Program</div><div className="font-medium">{draft.program_name || "—"}</div>
        </div>
      </Card>
      <div className="flex items-center gap-3">
        <Button onClick={generate} size="lg">
          <Plus className="h-4 w-4 mr-1.5" /> Generate Routing ({draft.nights + 1} days)
        </Button>
        {draft.routing.length > 0 && (
          <span className="text-sm text-emerald-700">✓ {draft.routing.length} day rows ready</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Click Generate to build the day-by-day routing table, then continue to Step 9 to fill in cities and programs.
      </p>
    </div>
  );
}

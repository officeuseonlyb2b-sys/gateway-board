import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { useDB, MEAL_PLANS, type MealPlan, guideRateForPax, activityRateForPax } from "@/lib/mock-store";
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
  computeOption, computeAddonsTotal, totalPax, gstRateFor, transportLineTotal,
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

export const Route = createFileRoute("/_authenticated/costing")({
  head: () => ({ meta: [{ title: "New Quotation — MP Tourism Hub" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s.id === "string" ? s.id : undefined }),
  component: WizardPage,
});

// ============================================================
// Step definitions
// ============================================================
const STEPS: { n: number; label: string }[] = [
  { n: 1, label: "Type" }, { n: 2, label: "Who" }, { n: 3, label: "Pax+Type" },
  { n: 4, label: "From" }, { n: 5, label: "Travel" }, { n: 6, label: "Duration" },
  { n: 7, label: "Program" }, { n: 8, label: "Create Route" }, { n: 9, label: "Routing" },
  { n: 10, label: "Transport" }, { n: 11, label: "Activities" }, { n: 12, label: "Entrances" },
  { n: 13, label: "Guide" }, { n: 14, label: "Misc" }, { n: 15, label: "Hotels" },
  { n: 16, label: "Costing" }, { n: 17, label: "Final" }, { n: 18, label: "Optionals" },
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

function uid() { return Math.random().toString(36).slice(2, 10); }

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

    const existing = loadDraft();
    if (existing) setShowBanner(true);
    else initDraft();
    setInitialized(true);
  }, [initialized, search.id]);

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

  const step = draft.step;
  const set = (patch: Partial<QuoteDraft>) => writeDraft({ ...draft, ...patch });

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
    if (n < 1 || n > 18) return;
    if (n > step && !canProceed) return;
    const next = { ...draft, step: n };
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
                Step {step} of 18 — {STEPS[step - 1].label}
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
          {step < 18 ? (
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
          const canJump = s.n <= step;
          return (
            <div key={s.n} className="flex items-start">
              <button
                type="button"
                disabled={!canJump}
                onClick={() => canJump && onJump(s.n)}
                className="flex flex-col items-center gap-1 min-w-[68px] group"
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                    done && "bg-primary border-primary text-primary-foreground",
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
      // Pax + Type
      if (d.query_type === "Brochure") return (d.pax_min ?? 0) >= 1 && (d.pax_max ?? 0) >= (d.pax_min ?? 0);
      return (d.adults + d.ss + d.children.length) >= 1;
    }
    case 4: return !!d.departure_city;
    case 5: return d.query_type === "Brochure" ? true : d.travel_modes.length >= 1;
    case 6: {
      if (d.nights < 1) return false;
      if (d.query_type === "Brochure") return !!d.brochure_validity_from && !!d.brochure_validity_till;
      // B2B/B2C: with dates → need start_date; without dates → ok
      if (d.has_dates === false) return true;
      return !!d.start_date;
    }
    case 7: return d.program_mode === "existing" ? !!d.program_id : !!d.program_name;
    case 8: return true; // Create-route gate — always allow (button generates rows)
    case 9: {
      const overnightRows = d.routing.filter((r) => r.overnight);
      if (overnightRows.length === 0) return false;
      return overnightRows.some((r) => !!r.city_id);
    }
    case 15: {
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
  switch (draft.step) {
    case 1: return <Step1 draft={draft} set={set} />;
    case 2: return <Step2 draft={draft} set={set} />;
    case 3: return <StepPaxType draft={draft} set={set} />;
    case 4: return <StepDeparture draft={draft} set={set} />;
    case 5: return <StepTravel draft={draft} set={set} />;
    case 6: return <StepDuration draft={draft} set={set} />;
    case 7: return <Step4 draft={draft} set={set} />;
    case 8: return <StepCreateRoute draft={draft} set={set} />;
    case 9: return <Step9 draft={draft} set={set} />;
    case 10: return <Step10 draft={draft} set={set} />;
    case 11: return <Step11 draft={draft} set={set} />;
    case 12: return <Step12 draft={draft} set={set} />;
    case 13: return <Step13 draft={draft} set={set} />;
    case 14: return <Step14 draft={draft} set={set} />;
    case 15: return <Step15 draft={draft} set={set} />;
    case 16: return <Step16 draft={draft} set={set} />;
    case 17: return <Step17 draft={draft} set={set} />;
    case 18: return <Step18 draft={draft} set={set} />;
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

  const entrancesForCity = (city_id: string) => {
    const cityName = d.cities.find((c) => c.id === city_id)?.name;
    if (!cityName) return [];
    const ec = d.entrance_cities.find((c) => c.name === cityName);
    if (!ec) return [];
    return d.entrance_sites.filter((s) => s.city_id === ec.id && s.is_active);
  };
  const OVERNIGHT_NONE = "__none__";

  const cityName = (id: string) => d.cities.find((c) => c.id === id)?.name || "";
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Day-by-Day Routing</h2>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2 w-14">Day</th>
              <th className="text-left p-2 w-24">Day Name</th>
              <th className="text-left p-2 w-28">Date</th>
              <th className="text-left p-2">From</th>
              <th className="text-left p-2">To</th>
              <th className="text-left p-2">Overnight</th>
              <th className="text-left p-2 w-28">Travel By</th>
              <th className="text-left p-2">Day's Program</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, i) => {
              const isLast = i === draft.routing.length - 1;
              const ents = entrancesForCity(r.to_city_id || r.city_id);
              const fromDefault = i === 0
                ? draft.departure_city
                : cityName(draft.routing[i - 1]?.city_id || "") || draft.routing[i - 1]?.to_city || "";
              const weekday = draft.has_dates !== false && r.date
                ? new Date(r.date).toLocaleDateString("en-US", { weekday: "long" })
                : `Day ${r.day}`;
              return (
                <>
                <tr key={i} className="border-t align-top">
                  <td className="p-2 font-semibold">Day {r.day}</td>
                  <td className="p-2">
                    <Input className="h-8 text-xs" value={r.day_name || weekday}
                      onChange={(e) => updateRow(i, { day_name: e.target.value })} />
                  </td>
                  <td className="p-2 text-xs">
                    {draft.has_dates === false ? <span className="text-muted-foreground">—</span> : fmtDateShort(r.date)}
                  </td>
                  <td className="p-2">
                    <Input className="h-8 text-xs" value={r.from_city ?? fromDefault}
                      onChange={(e) => updateRow(i, { from_city: e.target.value })} />
                  </td>
                  <td className="p-2">
                    <Select
                      value={r.to_city_id || ""}
                      onValueChange={(v) => {
                        // Auto-fill overnight to same city if overnight is empty or previously mirrored TO
                        const shouldMirror = !r.city_id || r.city_id === r.to_city_id;
                        updateRow(i, {
                          to_city_id: v,
                          to_city: cityName(v),
                          ...(isLast
                            ? { city_id: v }
                            : shouldMirror
                              ? { city_id: v }
                              : {}),
                        });
                      }}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder={isLast ? "Departure city…" : "Destination…"} /></SelectTrigger>
                      <SelectContent>
                        {d.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isLast && (
                      <Input className="h-7 text-[11px] mt-1"
                        placeholder="or type departure city"
                        value={r.to_city && !r.to_city_id ? r.to_city : ""}
                        onChange={(e) => updateRow(i, { to_city: e.target.value })} />
                    )}
                  </td>
                  <td className="p-2">
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
                  <td className="p-2 space-y-1">
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
                    {r.travel_by && (
                      <Input className="h-7 text-[11px]"
                        placeholder={
                          r.travel_by === "Flight" ? "e.g. IndiGo 6E-214"
                          : r.travel_by === "Train" ? "e.g. Vande Bharat"
                          : r.travel_by === "Road" || r.travel_by === "Self Drive" ? "e.g. Tempo Traveller"
                          : "Details (optional)"
                        }
                        value={r.travel_by_detail || ""}
                        onChange={(e) => updateRow(i, { travel_by_detail: e.target.value })} />
                    )}
                  </td>
                  <td className="p-2 space-y-1">
                    <Textarea rows={2} placeholder="Describe the day's program…"
                      value={r.program} onChange={(e) => updateRow(i, { program: e.target.value })} />
                    {ents.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ents.map((e) => (
                          <button key={e.id} type="button"
                            onClick={() => {
                              const already = draft.entrances.some((x) => x.site_id === e.id);
                              if (already) return;
                              set({
                                entrances: [...draft.entrances, {
                                  id: uid(), site_id: e.id, indian_pax: totalPax(draft),
                                  indian_rate: e.indian_rate, foreign_pax: 0, foreign_rate: e.foreigner_rate,
                                }],
                              });
                              toast.success(`${e.site_name} added to entrances`);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20">
                            + {e.site_name} ₹{e.indian_rate}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
                {r.travel_by && r.transport_expanded && (
                  <tr key={`${i}-details`} className="border-t bg-muted/20">
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
function Step10({ draft, set }: StepProps) {
  const d = useDB();
  const totalPax = draft.adults + draft.ss + draft.children.length;
  const opts = d.travel_options.filter((t) => {
    if (!t.is_active) return false;
    const min = t.min_pax ?? 1;
    const max = t.max_pax ?? t.capacity_persons ?? Number.MAX_SAFE_INTEGER;
    return totalPax >= min && totalPax <= max;
  });
  const labelFor = (o: typeof opts[number]) => {
    const min = o.min_pax ?? 1;
    const max = o.max_pax ?? o.capacity_persons;
    const range = min === max ? `${max} pax` : min <= 1 ? `up to ${max} pax` : `${min}-${max} pax`;
    return `${o.vehicle_type} (${range})`;
  };
  const lineTotal = transportLineTotal;
  const total = draft.transport.reduce((s, l) => s + lineTotal(l), 0);
  const noMatch = opts.length === 0;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Transport Options</h2>
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
            Showing vehicles suitable for {totalPax} pax
          </span>
        </div>
        <Button
          size="sm"
          disabled={noMatch}
          onClick={() => set({ transport: [...draft.transport, { id: uid(), travel_id: opts[0]?.id || "", vehicles: 1, days: draft.nights + 1, rate: opts[0]?.rate_per_day || 0, rate_format: "per_day", reporting_cost: 0 }] })}
        >
          <Plus className="h-3 w-3 mr-1" /> Add Transport
        </Button>
      </div>
      {noMatch && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3">
          No standard vehicle found for {totalPax} pax. Please contact operations.
        </div>
      )}
      {!noMatch && draft.transport.length === 0 && <p className="text-sm text-muted-foreground">No transport added yet.</p>}
      {draft.transport.map((t, i) => {
        const current = d.travel_options.find((x) => x.id === t.travel_id);
        const rowOpts = current && !opts.some((o) => o.id === current.id) ? [current, ...opts] : opts;
        const format = t.rate_format ?? "per_day";
        const patch = (p: Partial<typeof t>) => {
          const n = [...draft.transport]; n[i] = { ...t, ...p }; set({ transport: n });
        };
        return (
        <Card key={t.id} className="p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_80px_36px] gap-2 items-end">
            <div>
              <Label className="text-xs">Vehicle</Label>
              <Select value={t.travel_id} onValueChange={(v) => {
                const to = rowOpts.find((x) => x.id === v);
                patch({ travel_id: v, rate: to?.rate_per_day ? to.rate_per_day : t.rate });
              }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {rowOpts.map((o) => <SelectItem key={o.id} value={o.id}>{labelFor(o)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rate Format</Label>
              <Select value={format} onValueChange={(v) => patch({ rate_format: v as "per_day" | "total" | "prefilled" | "per_route" })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_day">Per Day</SelectItem>
                  <SelectItem value="total">Total Program</SelectItem>
                  <SelectItem value="prefilled">Pre-filled</SelectItem>
                  <SelectItem value="per_route">Per Route / Per Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Vehicles</Label><Input type="number" min={1} value={t.vehicles}
              onChange={(e) => patch({ vehicles: parseInt(e.target.value) || 1 })} /></div>
            <Button size="icon" variant="ghost" onClick={() => set({ transport: draft.transport.filter((x) => x.id !== t.id) })}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          {format === "per_route" ? (
            <div className="space-y-2">
              <Label className="text-xs">Per-Route Rates (₹ per routing day)</Label>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 w-16">Day</th>
                      <th className="text-left p-2">Route</th>
                      <th className="text-right p-2 w-32">Rate (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.routing.map((r, ri) => {
                      const fromLabel = r.from_city
                        || (ri === 0 ? draft.departure_city : (d.cities.find((c) => c.id === draft.routing[ri - 1]?.city_id)?.name || "—"));
                      const toLabel = d.cities.find((c) => c.id === r.city_id)?.name || r.to_city || "—";
                      const rateVal = t.per_route_rates?.[ri] ?? 0;
                      return (
                        <tr key={ri} className="border-t">
                          <td className="p-2 font-medium">Day {r.day}</td>
                          <td className="p-2 text-muted-foreground">
                            {fromLabel && toLabel && fromLabel !== toLabel ? `${fromLabel} → ${toLabel}` : `${toLabel} Local`}
                          </td>
                          <td className="p-2 text-right">
                            <Input type="number" min={0} className="h-7 text-xs text-right" value={rateVal || ""}
                              onChange={(e) => {
                                const next = [...(t.per_route_rates ?? Array(draft.routing.length).fill(0))];
                                while (next.length < draft.routing.length) next.push(0);
                                next[ri] = parseFloat(e.target.value) || 0;
                                patch({ per_route_rates: next.slice(0, draft.routing.length) });
                              }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                <div><Label className="text-xs">Reporting Cost (₹)</Label><Input type="number" value={t.reporting_cost ?? 0}
                  onChange={(e) => patch({ reporting_cost: parseFloat(e.target.value) || 0 })} /></div>
                <div className="text-right"><Label className="text-xs">Line Total</Label>
                  <div className="text-sm font-semibold pt-2">{inr(lineTotal(t))}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              {format === "total" ? (
                <div className="md:col-span-2">
                  <Label className="text-xs">Total Program Rate (₹)</Label>
                  <Input type="number" value={t.total_override ?? 0}
                    onChange={(e) => patch({ total_override: parseFloat(e.target.value) || 0 })} />
                </div>
              ) : (
                <>
                  <div><Label className="text-xs">Days</Label><Input type="number" min={1} value={t.days}
                    onChange={(e) => patch({ days: parseInt(e.target.value) || 1 })} /></div>
                  <div><Label className="text-xs">Rate / day (₹)</Label><Input type="number" value={t.rate || ""}
                    onChange={(e) => patch({ rate: parseFloat(e.target.value) || 0 })} /></div>
                </>
              )}
              <div><Label className="text-xs">Reporting Cost (₹)</Label><Input type="number" value={t.reporting_cost ?? 0}
                onChange={(e) => patch({ reporting_cost: parseFloat(e.target.value) || 0 })} /></div>
              <div className="text-right"><Label className="text-xs">Line Total</Label>
                <div className="text-sm font-semibold pt-2">{inr(lineTotal(t))}</div>
              </div>
            </div>
          )}
          <Input placeholder="Remarks (optional)" value={t.remarks || ""}
            onChange={(e) => patch({ remarks: e.target.value })} className="text-xs" />
        </Card>
        );
      })}
      <div className="text-right font-semibold">Transport Total: {inr(total)}</div>
    </div>
  );
}

// ============================================================
// STEP 11 — Activities
// ============================================================
function Step11({ draft, set }: StepProps) {
  const d = useDB();
  const routingCities = new Set(draft.routing.map((r) => d.cities.find((c) => c.id === r.city_id)?.name).filter(Boolean) as string[]);
  const relevant = d.activities.filter((a) => {
    if (!a.is_active) return false;
    const dest = d.activity_destinations.find((x) => x.id === a.destination_id)?.name;
    return dest && (routingCities.has(dest) || routingCities.size === 0);
  });

  const pax = totalPax(draft);
  const toggle = (a: typeof relevant[number]) => {
    const existing = draft.activities.find((x) => x.activity_id === a.id);
    if (existing) set({ activities: draft.activities.filter((x) => x.id !== existing.id) });
    else set({ activities: [...draft.activities, { id: uid(), activity_id: a.id, qty: 1, rate: activityRateForPax(a, pax) }] });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Activities & Experiences</h2>
      {relevant.length === 0 && <p className="text-sm text-muted-foreground">No activities found for routing cities.</p>}
      <div className="space-y-2">
        {relevant.map((a) => {
          const dest = d.activity_destinations.find((x) => x.id === a.destination_id)?.name;
          const line = draft.activities.find((x) => x.activity_id === a.id);
          const on = !!line;
          return (
            <div key={a.id} className={cn("p-3 border rounded-lg flex items-center gap-3", on && "border-accent bg-accent/5")}>
              <Checkbox checked={on} onCheckedChange={() => toggle(a)} />
              <div className="flex-1">
                <div className="text-sm font-medium">{a.activity_name} <span className="text-xs text-muted-foreground">— {dest}</span></div>
                <div className="text-xs text-muted-foreground">{a.description}</div>
              </div>
              {on && (
                <>
                  <div><Label className="text-xs">Qty</Label><Input type="number" min={1} value={line!.qty} className="w-20"
                    onChange={(e) => set({ activities: draft.activities.map((x) => x.id === line!.id ? { ...x, qty: parseInt(e.target.value) || 1 } : x) })} /></div>
                  <div className="text-sm font-semibold w-24 text-right">{inr(line!.rate * line!.qty)}</div>
                </>
              )}
              <span className="text-sm">{inr(a.price)}</span>
            </div>
          );
        })}
      </div>
      <CustomAdd label="Custom Activity" onAdd={(name, rate) => set({
        activities: [...draft.activities, { id: uid(), custom_name: name, qty: 1, rate }],
      })} />
      {draft.activities.filter((x) => x.custom_name).map((x) => (
        <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
          <span>{x.custom_name} × {x.qty}</span>
          <span>{inr(x.rate * x.qty)}
            <button className="ml-2 text-destructive" onClick={() => set({ activities: draft.activities.filter((y) => y.id !== x.id) })}>×</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomAdd({ label, onAdd }: { label: string; onAdd: (name: string, amount: number) => void }) {
  const [n, setN] = useState(""); const [a, setA] = useState(0);
  return (
    <div className="flex gap-2 items-end pt-3 border-t">
      <div className="flex-1"><Label className="text-xs">{label}</Label><Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Name" /></div>
      <div className="w-32"><Label className="text-xs">Amount</Label><Input type="number" value={a} onChange={(e) => setA(parseFloat(e.target.value) || 0)} /></div>
      <Button size="sm" onClick={() => { if (n && a > 0) { onAdd(n, a); setN(""); setA(0); } }}>Add</Button>
    </div>
  );
}

// ============================================================
// STEP 12 — Entrances
// ============================================================
function Step12({ draft, set }: StepProps) {
  const d = useDB();
  const routingCityNames = new Set(draft.routing.map((r) => d.cities.find((c) => c.id === r.city_id)?.name).filter(Boolean) as string[]);
  const cityIds = new Set(d.entrance_cities.filter((c) => routingCityNames.has(c.name)).map((c) => c.id));
  const relevant = d.entrance_sites.filter((s) => s.is_active && (cityIds.has(s.city_id) || cityIds.size === 0));

  const pax = totalPax(draft);
  const toggle = (s: typeof relevant[number]) => {
    const existing = draft.entrances.find((x) => x.site_id === s.id);
    if (existing) set({ entrances: draft.entrances.filter((x) => x.id !== existing.id) });
    else set({ entrances: [...draft.entrances, { id: uid(), site_id: s.id, indian_pax: pax, indian_rate: s.indian_rate, foreign_pax: 0, foreign_rate: s.foreigner_rate, student_pax: 0, student_rate: s.student_rate ?? 0 }] });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Entrance Fees</h2>
      <div className="space-y-2">
        {relevant.map((s) => {
          const line = draft.entrances.find((x) => x.site_id === s.id);
          const on = !!line;
          const cityName = d.entrance_cities.find((c) => c.id === s.city_id)?.name;
          return (
            <div key={s.id} className={cn("p-3 border rounded-lg", on && "border-accent bg-accent/5")}>
              <div className="flex items-center gap-3">
                <Checkbox checked={on} onCheckedChange={() => toggle(s)} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.site_name} <span className="text-xs text-muted-foreground">— {cityName}</span></div>
                  <div className="text-xs text-muted-foreground">
                    Indian ₹{s.indian_rate} / Foreign ₹{s.foreigner_rate}
                    {s.student_rate ? ` / Student ₹${s.student_rate}` : ""}
                  </div>
                </div>
              </div>
              {on && line && (
                <div className="mt-2 pl-8 grid grid-cols-6 gap-2 text-xs items-end">
                  <div><Label className="text-[10px]">Indian Pax</Label><Input type="number" value={line.indian_pax}
                    onChange={(e) => set({ entrances: draft.entrances.map((x) => x.id === line.id ? { ...x, indian_pax: parseInt(e.target.value) || 0 } : x) })} /></div>
                  <div><Label className="text-[10px]">Foreign Pax</Label><Input type="number" value={line.foreign_pax}
                    onChange={(e) => set({ entrances: draft.entrances.map((x) => x.id === line.id ? { ...x, foreign_pax: parseInt(e.target.value) || 0 } : x) })} /></div>
                  <div><Label className="text-[10px]">Student Pax</Label><Input type="number" value={line.student_pax ?? 0}
                    onChange={(e) => set({ entrances: draft.entrances.map((x) => x.id === line.id ? { ...x, student_pax: parseInt(e.target.value) || 0 } : x) })} /></div>
                  <div><Label className="text-[10px]">Student Rate</Label><Input type="number" value={line.student_rate ?? 0}
                    onChange={(e) => set({ entrances: draft.entrances.map((x) => x.id === line.id ? { ...x, student_rate: parseFloat(e.target.value) || 0 } : x) })} /></div>
                  <div className="col-span-2 text-right font-semibold pt-4">
                    {inr(line.indian_pax * line.indian_rate + line.foreign_pax * line.foreign_rate + (line.student_pax ?? 0) * (line.student_rate ?? 0))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <CustomAdd label="Custom Entrance" onAdd={(name, rate) => set({
        entrances: [...draft.entrances, { id: uid(), custom_name: name, indian_pax: pax, indian_rate: rate, foreign_pax: 0, foreign_rate: 0, student_pax: 0, student_rate: 0 }],
      })} />
      {draft.entrances.filter((x) => x.custom_name).map((x) => (
        <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
          <span>{x.custom_name} — {x.indian_pax} pax × ₹{x.indian_rate}</span>
          <span>{inr(x.indian_pax * x.indian_rate)}
            <button className="ml-2 text-destructive" onClick={() => set({ entrances: draft.entrances.filter((y) => y.id !== x.id) })}>×</button>
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// STEP 13 — Guide
// ============================================================
function Step13({ draft, set }: StepProps) {
  const d = useDB();
  const opts = d.guides.filter((g) => g.is_active);
  const pax = totalPax(draft);
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Guide Charges</h2>
        <Button size="sm" onClick={() => {
          const first = opts[0];
          const rate = first ? guideRateForPax(first, pax) : 0;
          set({ guides: [...draft.guides, { id: uid(), guide_id: first?.id || "", days: 1, guides: 1, rate }] });
        }}>
          <Plus className="h-3 w-3 mr-1" /> Add Guide
        </Button>
      </div>
      {draft.guides.map((g, i) => (
        <Card key={g.id} className="p-3 grid grid-cols-[1fr_80px_80px_100px_100px_36px] gap-2 items-end">
          <div>
            <Label className="text-xs">Guide ({pax} pax)</Label>
            <Select value={g.guide_id} onValueChange={(v) => {
              const go = opts.find((x) => x.id === v);
              const n = [...draft.guides]; n[i] = { ...g, guide_id: v, rate: go ? guideRateForPax(go, pax) : g.rate };
              set({ guides: n });
            }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {opts.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Days</Label><Input type="number" min={1} value={g.days}
            onChange={(e) => { const n = [...draft.guides]; n[i] = { ...g, days: parseInt(e.target.value) || 1 }; set({ guides: n }); }} /></div>
          <div><Label className="text-xs"># Guides</Label><Input type="number" min={1} value={g.guides}
            onChange={(e) => { const n = [...draft.guides]; n[i] = { ...g, guides: parseInt(e.target.value) || 1 }; set({ guides: n }); }} /></div>
          <div><Label className="text-xs">Rate/day</Label><Input type="number" value={g.rate}
            onChange={(e) => { const n = [...draft.guides]; n[i] = { ...g, rate: parseFloat(e.target.value) || 0 }; set({ guides: n }); }} /></div>
          <div className="text-right"><Label className="text-xs">Total</Label><div className="text-sm font-semibold pt-2">{inr(g.rate * g.guides * g.days)}</div></div>
          <Button size="icon" variant="ghost" onClick={() => set({ guides: draft.guides.filter((x) => x.id !== g.id) })}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// STEP 14 — Miscellaneous
// ============================================================
function Step14({ draft, set }: StepProps) {
  const d = useDB();
  const items = d.miscellaneous_items.filter((x) => x.is_active);
  const pax = totalPax(draft);

  const toggle = (m: typeof items[number]) => {
    const existing = draft.misc.find((x) => x.item_id === m.id);
    if (existing) set({ misc: draft.misc.filter((x) => x.id !== existing.id) });
    else {
      const qty = m.unit === "per_person" ? pax : m.unit === "per_day" ? draft.nights : 1;
      set({ misc: [...draft.misc, { id: uid(), item_id: m.id, qty, rate: m.rate, unit: m.unit }] });
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Miscellaneous</h2>
      <div className="space-y-2">
        {items.map((m) => {
          const line = draft.misc.find((x) => x.item_id === m.id);
          const on = !!line;
          return (
            <div key={m.id} className={cn("p-3 border rounded-lg flex items-center gap-3", on && "border-accent bg-accent/5")}>
              <Checkbox checked={on} onCheckedChange={() => toggle(m)} />
              <div className="flex-1">
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">₹{m.rate} / {m.unit}</div>
              </div>
              {on && line && (
                <>
                  <div><Label className="text-xs">Qty</Label><Input type="number" value={line.qty} className="w-20"
                    onChange={(e) => set({ misc: draft.misc.map((x) => x.id === line.id ? { ...x, qty: parseInt(e.target.value) || 0 } : x) })} /></div>
                  <div className="w-24 text-right font-semibold">{inr(line.qty * line.rate)}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <CustomAdd label="Custom Misc Item" onAdd={(name, rate) => set({
        misc: [...draft.misc, { id: uid(), custom_name: name, qty: 1, rate, unit: "fixed" }],
      })} />
      {draft.misc.filter((x) => x.custom_name).map((x) => (
        <div key={x.id} className="text-xs flex justify-between p-2 bg-muted/30 rounded">
          <span>{x.custom_name} × {x.qty}</span>
          <span>{inr(x.qty * x.rate)}
            <button className="ml-2 text-destructive" onClick={() => set({ misc: draft.misc.filter((y) => y.id !== x.id) })}>×</button>
          </span>
        </div>
      ))}
    </div>
  );
}

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

function Step15({ draft, set }: StepProps) {
  const d = useDB();
  const [activeOpt, setActiveOpt] = useState<OptionKey>(draft.hotel_options[0]?.key || "A");
  const [quickAdd, setQuickAdd] = useState<{ cityId: string; cityName: string } | null>(null);
  const overnightRouting = draft.routing.filter((r) => r.overnight && (r.city_id || r.to_city));

  const addOption = () => {
    const existing = draft.hotel_options.map((o) => o.key);
    const next = (["A", "B", "C", "D"] as OptionKey[]).find((k) => !existing.includes(k));
    if (!next) return;
    set({ hotel_options: [...draft.hotel_options, { key: next, label: "", category: "", selections: [], inclusions: [], exclusions: [] }] });
    setActiveOpt(next);
  };

  const updateOption = (key: OptionKey, patch: Partial<HotelOption>) => {
    set({ hotel_options: draft.hotel_options.map((o) => o.key === key ? { ...o, ...patch } : o) });
  };

  const activeOption = draft.hotel_options.find((o) => o.key === activeOpt) || draft.hotel_options[0];
  const activeCategory = activeOption?.category || "";

  const findRate = (room_id: string, meal: MealPlan, dateISO: string) => {
    return findRatePlan(d.rate_plans, room_id, meal, dateISO);
  };

  const applyCategory = (v: string) => {
    if (!activeOption) return;
    const def = defaultsForCategory(v);
    updateOption(activeOption.key, {
      category: v,
      label: v,
      selections: [],
      inclusions: def.inclusions,
      exclusions: def.exclusions,
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Accommodation Options (up to 4)</h2>

      <div className="flex gap-2 border-b">
        {draft.hotel_options.map((o) => (
          <button key={o.key} onClick={() => setActiveOpt(o.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              activeOpt === o.key ? "border-accent text-accent" : "border-transparent text-muted-foreground",
            )}>
            Option {o.key} · {o.category || "Select Category"}
          </button>
        ))}
        {draft.hotel_options.length < 4 && (
          <button onClick={addOption} className="px-3 py-2 text-sm text-primary">+ Add Option</button>
        )}
      </div>

      {activeOption && (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs">Hotel Category for this Option</Label>
              <Select value={activeCategory} onValueChange={applyCategory}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {WIZARD_HOTEL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {draft.hotel_options.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => {
                const next = draft.hotel_options.filter((o) => o.key !== activeOpt);
                set({ hotel_options: next });
                setActiveOpt(next[0].key);
              }}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" /> Remove option
              </Button>
            )}
          </div>

          {overnightRouting.length === 0 && (
            <p className="text-sm text-muted-foreground">Complete routing in Step 9 first.</p>
          )}

          {!activeCategory && overnightRouting.length > 0 && (
            <p className="text-sm text-amber-600">Select a hotel category above to load hotels for each city.</p>
          )}

          {activeCategory && overnightRouting.map((day, i) => {
            const cityName = d.cities.find((c) => c.id === day.city_id)?.name || day.to_city || "";
            const cityKey = cityName.trim().toLowerCase();
            const catKey = activeCategory.trim().toLowerCase();
            const sel = activeOption.selections.find((s) => s.city_id === day.city_id);
            const hotelCityName = (h: typeof d.hotels[number]) =>
              (d.cities.find((c) => c.id === h.city_id)?.name || "").trim().toLowerCase();
            const allCityHotels = cityKey
              ? d.hotels.filter((h) => hotelCityName(h) === cityKey)
              : [];
            const cityHotels = allCityHotels.filter(
              (h) => h.hotel_category.trim().toLowerCase() === catKey,
            );
            const noCategoryMatch = cityHotels.length === 0;
            const hotelPool = noCategoryMatch ? allCityHotels : cityHotels;
            const rooms = sel ? d.room_categories.filter((r) => r.hotel_id === sel.hotel_id) : [];
            const meals = sel?.room_id ? availableMealPlans(d.rate_plans, sel.room_id, day.date) : [];
            const rate = sel && sel.room_id ? findRate(sel.room_id, sel.meal_plan, day.date) : null;
            const selHotel = sel ? d.hotels.find((h) => h.id === sel.hotel_id) : null;

            const setSel = (patch: Partial<typeof sel> & object) => {
              const others = activeOption.selections.filter((s) => s.city_id !== day.city_id);
              const cur = sel || { city_id: day.city_id, hotel_id: "", room_id: "", meal_plan: "CP" as MealPlan };
              const merged = { ...cur, ...patch };
              // Recompute fallback flag whenever hotel changes
              if ("hotel_id" in patch) {
                const h = d.hotels.find((x) => x.id === merged.hotel_id);
                merged.is_fallback = !!h && h.hotel_category !== activeCategory;
              }
              updateOption(activeOption.key, { selections: [...others, merged] });
            };

            return (
              <Card key={i} className="p-3">
                <div className="text-sm font-semibold mb-2">Day {day.day} · {cityName} · {fmtDateShort(day.date)}</div>

                {noCategoryMatch && allCityHotels.length === 0 ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <div className="text-sm text-amber-800 mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" /> No hotels found in {cityName}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setQuickAdd({ cityId: day.city_id, cityName: cityName || "" })}>
                        <Plus className="h-3.5 w-3.5" /> Add Hotel for {cityName}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href="/hotels" target="_blank" rel="noreferrer">Go to Hotels Module ↗</a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {noCategoryMatch && (
                      <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 flex flex-wrap items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>No <b>{activeCategory}</b> hotels found in {cityName}. Select from available hotels below (showing all categories).</span>
                        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setQuickAdd({ cityId: day.city_id, cityName: cityName || "" })}>
                          <Plus className="h-3 w-3" /> Add New
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" asChild>
                          <a href="/hotels" target="_blank" rel="noreferrer">Hotels ↗</a>
                        </Button>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">Hotel</Label>
                        <Select value={sel?.hotel_id || ""} onValueChange={(v) => setSel({ hotel_id: v, room_id: "" })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {hotelPool.map((h) => (
                              <SelectItem key={h.id} value={h.id}>
                                {h.name}{noCategoryMatch ? ` (${h.hotel_category})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Looking for {activeCategory} in {cityName || "—"} · {d.hotels.length} total, {cityHotels.length} matching ({allCityHotels.length} in city)
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Room</Label>
                        <Select value={sel?.room_id || ""} onValueChange={(v) => setSel({ room_id: v })} disabled={!sel?.hotel_id}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Meal Plan</Label>
                        <Select value={sel?.meal_plan || "CP"} onValueChange={(v) => setSel({ meal_plan: v as MealPlan })} disabled={!sel?.room_id || meals.length === 0}>
                          <SelectTrigger className="h-9"><SelectValue placeholder={meals.length === 0 ? "—" : "Select…"} /></SelectTrigger>
                          <SelectContent>
                            {(meals.length ? meals : MEAL_PLANS).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="text-xs pt-5 space-y-0.5">
                        {rate ? (
                          <span className="text-green-700">✓ {rate.season_label} · ₹{rate.double_rate}/dbl</span>
                        ) : sel?.room_id ? (
                          <span className="text-amber-600">⚠ No rate for these dates</span>
                        ) : null}
                        {sel?.is_fallback && selHotel && (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">
                            ⚠ {selHotel.hotel_category} selected (differs from option)
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </Card>
            );
          })}

          {activeCategory && overnightRouting.length > 0 && activeOption.selections.some((s) => s.room_id) && (
            <>
              <PaxAllocator
                draft={draft}
                option={activeOption}
                onChange={(patch) => updateOption(activeOption.key, patch)}
              />
              <OptionCostPreview draft={draft} option={activeOption} />
              {optionUsesCustomAllocation(activeOption) && (
                <OptionPerPersonPreview draft={draft} option={activeOption} />
              )}
            </>
          )}

          {activeCategory && (
            <OptionInclusionsEditor
              option={activeOption}
              onChange={(patch) => updateOption(activeOption.key, patch)}
            />
          )}
        </div>
      )}

      {quickAdd && (
        <QuickAddHotelDialog
          open={!!quickAdd}
          onOpenChange={(v) => { if (!v) setQuickAdd(null); }}
          cityId={quickAdd.cityId}
          cityName={quickAdd.cityName}
          category={activeCategory}
          onCreated={(hotelId) => {
            // auto-select the newly added hotel for this city day
            const others = activeOption.selections.filter((s) => s.city_id !== quickAdd.cityId);
            const h = d.hotels.find((x) => x.id === hotelId);
            updateOption(activeOption.key, {
              selections: [...others, {
                city_id: quickAdd.cityId,
                hotel_id: hotelId,
                room_id: "",
                meal_plan: "CP" as MealPlan,
                is_fallback: !!h && h.hotel_category !== activeCategory,
              }],
            });
            setQuickAdd(null);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Per-option Inclusions & Exclusions editor (Step 15).
// ------------------------------------------------------------
function OptionInclusionsEditor({
  option, onChange,
}: {
  option: HotelOption;
  onChange: (patch: Partial<HotelOption>) => void;
}) {
  const [newInc, setNewInc] = useState("");
  const [newExc, setNewExc] = useState("");
  const inclusions = option.inclusions ?? [];
  const exclusions = option.exclusions ?? [];

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground italic">
        Auto-filled for <b>{option.category || "—"}</b>. Customize as needed.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="section-label mb-2">Inclusions · Option {option.key}</div>
          <ul className="space-y-1 mb-2">
            {inclusions.map((x, i) => (
              <li key={i} className="text-sm flex justify-between gap-2">
                <span>✓ {x}</span>
                <button
                  onClick={() => onChange({ inclusions: inclusions.filter((_, j) => j !== i) })}
                  className="text-destructive"
                  aria-label="Remove"
                >×</button>
              </li>
            ))}
            {inclusions.length === 0 && (
              <li className="text-xs text-muted-foreground">No inclusions yet.</li>
            )}
          </ul>
          <div className="flex gap-2">
            <Input value={newInc} onChange={(e) => setNewInc(e.target.value)} placeholder="Add inclusion" />
            <Button size="sm" onClick={() => {
              const v = newInc.trim();
              if (v) { onChange({ inclusions: [...inclusions, v] }); setNewInc(""); }
            }}>Add</Button>
          </div>
        </Card>
        <Card className="p-3">
          <div className="section-label mb-2">Exclusions · Option {option.key}</div>
          <ul className="space-y-1 mb-2">
            {exclusions.map((x, i) => (
              <li key={i} className="text-sm flex justify-between gap-2">
                <span>✗ {x}</span>
                <button
                  onClick={() => onChange({ exclusions: exclusions.filter((_, j) => j !== i) })}
                  className="text-destructive"
                  aria-label="Remove"
                >×</button>
              </li>
            ))}
            {exclusions.length === 0 && (
              <li className="text-xs text-muted-foreground">No exclusions yet.</li>
            )}
          </ul>
          <div className="flex gap-2">
            <Input value={newExc} onChange={(e) => setNewExc(e.target.value)} placeholder="Add exclusion" />
            <Button size="sm" onClick={() => {
              const v = newExc.trim();
              if (v) { onChange({ exclusions: [...exclusions, v] }); setNewExc(""); }
            }}>Add</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}


// ------------------------------------------------------------
// Live cost preview under each Option tab in Step 15.
// Read-only rooms-only (Net, GST, Net+GST) with per-day warnings.
// ------------------------------------------------------------
function OptionCostPreview({ draft, option }: { draft: QuoteDraft; option: HotelOption }) {
  const d = useDB();
  const [open, setOpen] = useState(true);
  const overnight = draft.routing.filter((r) => r.overnight && r.city_id);
  const gstFor = gstRateFor;

  let sglNet = 0, dblNet = 0, trpNet = 0;
  let sglGst = 0, dblGst = 0, trpGst = 0;
  const missingDays: { day: number; city: string }[] = [];

  overnight.forEach((day) => {
    const sel = option.selections.find((s) => s.city_id === day.city_id);
    const cityName = d.cities.find((c) => c.id === day.city_id)?.name || "—";
    if (!sel || !sel.room_id) return;
    const plan = findRatePlan(d.rate_plans, sel.room_id, sel.meal_plan, day.date);
    if (!plan) { missingDays.push({ day: day.day, city: cityName }); return; }
    const dbl = plan.double_rate;
    const sgl = plan.single_rate;
    const trp = dbl + plan.extra_bed_rate;
    sglNet += sgl; dblNet += dbl; trpNet += trp;
    sglGst += sgl * gstFor(sgl);
    dblGst += dbl * gstFor(dbl);
    trpGst += trp * gstFor(trp);
  });

  const sglTotal = sglNet + sglGst;
  const dblTotal = dblNet + dblGst;
  const trpTotal = trpNet + trpGst;

  return (
    <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#F0F4F8" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="text-sm font-semibold text-primary">
          OPTION {option.key} · {option.category || "—"} — Cost Preview
        </div>
        <span className="text-xs text-primary/70">{open ? "▾ Collapse" : "▸ Expand"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1.5 font-medium"></th>
                <th className="text-right py-1.5 font-medium">SGL</th>
                <th className="text-right py-1.5 font-medium">DBL</th>
                <th className="text-right py-1.5 font-medium">TRP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1">Room Cost (Net)</td>
                <td className="text-right tabular-nums">{inr(sglNet)}</td>
                <td className="text-right tabular-nums">{inr(dblNet)}</td>
                <td className="text-right tabular-nums">{inr(trpNet)}</td>
              </tr>
              <tr>
                <td className="py-1">GST on Rooms</td>
                <td className="text-right tabular-nums">{inr(sglGst)}</td>
                <td className="text-right tabular-nums">{inr(dblGst)}</td>
                <td className="text-right tabular-nums">{inr(trpGst)}</td>
              </tr>
              <tr className="border-t font-semibold">
                <td className="py-1.5">Net with GST</td>
                <td className="text-right tabular-nums text-primary">{inr(sglTotal)}</td>
                <td className="text-right tabular-nums text-primary">{inr(dblTotal)}</td>
                <td className="text-right tabular-nums text-primary">{inr(trpTotal)}</td>
              </tr>
            </tbody>
          </table>
          {missingDays.length > 0 && (
            <div className="mt-3 space-y-1">
              {missingDays.map((m) => (
                <div key={m.day} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Day {m.day} ({m.city}): No rate matched for selected dates
                </div>
              ))}
            </div>
          )}
          {option.selections.some((s) => s.is_fallback) && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Some hotels in this option belong to a different category than <b>{option.category}</b>.
            </div>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground italic">
            Room costs only. Add-ons (transport, guide, activities) are applied in Step 16.
          </div>
        </div>
      )}
    </Card>
  );
}

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

function PaxAllocator({
  draft, option, onChange,
}: {
  draft: QuoteDraft;
  option: HotelOption;
  onChange: (patch: Partial<HotelOption>) => void;
}) {
  const paxCount = Math.max(1, totalPax(draft));
  const enabled = !!option.use_custom_allocation;
  const allocs = normalizeAllocations(option.pax_allocations, paxCount);

  const setAllocs = (next: PersonAllocation[]) => onChange({ pax_allocations: next });

  const setRoomType = (person_id: number, type: PersonRoomType) => {
    // Clear existing sharing links when switching types
    const next = allocs.map((p) => {
      if (p.person_id === person_id) return { ...p, room_type: type, sharing_with: [] };
      // remove this person from other people's sharing_with, if this person moved out
      return { ...p, sharing_with: p.sharing_with.filter((id) => id !== person_id) };
    });
    setAllocs(next);
  };

  const togglePartner = (person_id: number, partner_id: number) => {
    const person = allocs.find((p) => p.person_id === person_id);
    if (!person) return;
    const maxShares = PERSON_ROOM_TYPES.find((r) => r.value === person.room_type)?.shares ?? 0;
    const has = person.sharing_with.includes(partner_id);
    let newList = has
      ? person.sharing_with.filter((id) => id !== partner_id)
      : [...person.sharing_with, partner_id];
    if (newList.length > maxShares) newList = newList.slice(-maxShares);

    // Mirror on partner: sync room_type + reciprocal sharing_with
    const next = allocs.map((p) => {
      if (p.person_id === person_id) return { ...p, sharing_with: newList };
      if (newList.includes(p.person_id)) {
        // ensure partner shares back and same type
        const withList = [person_id, ...newList.filter((id) => id !== p.person_id)];
        return { ...p, room_type: person.room_type, sharing_with: withList };
      }
      if (has && p.person_id === partner_id) {
        return { ...p, sharing_with: p.sharing_with.filter((id) => id !== person_id) };
      }
      return p;
    });
    setAllocs(next);
  };

  const setLabel = (person_id: number, label: string) => {
    setAllocs(allocs.map((p) => (p.person_id === person_id ? { ...p, label } : p)));
  };

  const applyPreset = (which: "single" | "double" | "one_rest") => {
    if (which === "single") setAllocs(presetAllSingle(paxCount));
    else if (which === "double") setAllocs(presetAllDouble(paxCount));
    else setAllocs(presetOneSingleRestDouble(paxCount));
  };

  return (
    <Card className="p-4 border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-primary">Per-Person Room Allocation</div>
          <div className="text-xs text-muted-foreground">
            Mix room types per traveller. Applies to Option {option.key} only.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Use custom allocation</span>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              if (v && !option.pax_allocations?.length) {
                onChange({ use_custom_allocation: true, pax_allocations: defaultAllocations(paxCount) });
              } else {
                onChange({ use_custom_allocation: v });
              }
            }}
          />
        </div>
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button size="sm" variant="outline" onClick={() => applyPreset("single")}>All Single</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset("double")}>All Double Sharing</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset("one_rest")}>1 Single + Rest Double</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1.5 font-medium">Person</th>
                  <th className="text-left py-1.5 font-medium">Room Type</th>
                  <th className="text-left py-1.5 font-medium">Sharing With</th>
                </tr>
              </thead>
              <tbody>
                {allocs.map((p) => {
                  const rt = PERSON_ROOM_TYPES.find((r) => r.value === p.room_type)!;
                  const others = allocs.filter((o) => o.person_id !== p.person_id);
                  return (
                    <tr key={p.person_id} className="border-t">
                      <td className="py-1.5 pr-2 align-top">
                        <Input
                          className="h-8 text-sm"
                          value={p.label}
                          onChange={(e) => setLabel(p.person_id, e.target.value)}
                          placeholder={`Person ${p.person_id}`}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <Select
                          value={p.room_type}
                          onValueChange={(v) => setRoomType(p.person_id, v as PersonRoomType)}
                        >
                          <SelectTrigger className="h-8 text-sm w-[180px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PERSON_ROOM_TYPES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 align-top">
                        {rt.shares > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {others.map((o) => {
                              const active = p.sharing_with.includes(o.person_id);
                              return (
                                <button
                                  key={o.person_id}
                                  type="button"
                                  onClick={() => togglePartner(p.person_id, o.person_id)}
                                  className={`text-xs px-2 py-1 rounded border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                            {p.sharing_with.length < rt.shares && (
                              <span className="text-[11px] text-amber-700 self-center">
                                Choose {rt.shares - p.sharing_with.length} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Live per-person cost preview (Step 15).
// ------------------------------------------------------------
function OptionPerPersonPreview({ draft, option }: { draft: QuoteDraft; option: HotelOption }) {
  const d = useDB();
  const rows = useMemo(() => computePersonTotals(draft, option, d), [draft, option, d]);
  const nights = draft.routing.filter((r) => r.overnight && r.city_id).length;
  if (!rows.length) return null;

  const nameById = new Map(rows.map((r) => [r.person_id, r.label]));

  return (
    <Card className="p-0 overflow-hidden border-primary/20" style={{ backgroundColor: "#FBF7EE" }}>
      <div className="px-4 py-2.5 text-sm font-semibold text-primary">
        OPTION {option.key} · Per-Person Cost Preview ({nights} night{nights === 1 ? "" : "s"})
      </div>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left py-1.5 font-medium">Person</th>
              <th className="text-left py-1.5 font-medium">Room</th>
              <th className="text-right py-1.5 font-medium">Room Net</th>
              <th className="text-right py-1.5 font-medium">Room GST</th>
              <th className="text-right py-1.5 font-medium">Rooms Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.person_id} className="border-t">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-muted-foreground">
                  {personRoomTypeLabel(r.room_type, r.sharing_with)}
                  {r.sharing_with.length > 0 && (
                    <span className="ml-1 text-xs">
                      w/ {r.sharing_with.map((id) => nameById.get(id) || `#${id}`).join(", ")}
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums">{inr(r.room_net)}</td>
                <td className="text-right tabular-nums">{inr(r.room_gst)}</td>
                <td className="text-right tabular-nums font-semibold text-primary">{inr(r.room_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[11px] text-muted-foreground italic">
          Add-ons (transport, guide, activities) will be split equally across all {rows.length} traveller{rows.length === 1 ? "" : "s"} in Steps 16 & 17.
        </div>
      </div>
    </Card>
  );
}



// ============================================================
// STEP 16 — Costing Variations
// ============================================================
function Step16({ draft, set }: StepProps) {
  const d = useDB();
  const includedKeys = draft.included_option_keys && draft.included_option_keys.length
    ? draft.included_option_keys
    : draft.hotel_options.map((o) => o.key);

  const toggleInclude = (key: OptionKey) => {
    const current = new Set(includedKeys);
    if (current.has(key)) current.delete(key); else current.add(key);
    set({ included_option_keys: Array.from(current) as OptionKey[] });
  };

  const includedOptions = draft.hotel_options.filter((o) => includedKeys.includes(o.key));
  const totals = useMemo(
    () => includedOptions.map((o) => computeOption(draft, o, d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, d, includedKeys.join(",")],
  );


  const addonBreakdown = useMemo(() => {
    const transport = draft.transport.reduce((s, l) => s + transportLineTotal(l), 0);
    const activities = draft.activities.reduce((s, l) => s + l.rate * l.qty, 0);
    const entrances = draft.entrances.reduce(
      (s, l) => s + l.indian_pax * l.indian_rate + l.foreign_pax * l.foreign_rate, 0);
    const guides = draft.guides.reduce((s, l) => s + l.rate * l.guides * l.days, 0);
    const misc = draft.misc.reduce((s, l) => s + l.rate * l.qty, 0);
    const optionals = draft.optionals.reduce((s, l) => s + l.rate * l.qty, 0);
    return { transport, activities, entrances, guides, misc, optionals };
  }, [draft]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Costing Variations</h2>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Markup %</Label>
          <Input type="number" value={draft.markup_percent} className="w-20"
            onChange={(e) => set({ markup_percent: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="text-sm font-semibold text-primary mb-2">Include Options in Final Quote</div>
        <div className="flex flex-wrap gap-4">
          {draft.hotel_options.map((o) => {
            const checked = includedKeys.includes(o.key);
            const hasSelections = o.selections.some((s) => s.room_id);
            return (
              <label key={o.key} className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer ${checked ? "bg-white border-primary" : "bg-muted/30 border-transparent opacity-60"}`}>
                <input type="checkbox" checked={checked} onChange={() => toggleInclude(o.key)} disabled={!hasSelections} />
                <span className="text-sm font-medium">Option {o.key}</span>
                <span className="text-xs text-muted-foreground">{o.category || "—"}{!hasSelections && " · empty"}</span>
              </label>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-2">Only selected options appear in the comparison and final quote.</div>
      </Card>

      {includedOptions.filter((o) => optionUsesCustomAllocation(o)).map((o) => (
        <OptionPerPersonPreview key={`alloc-${o.key}`} draft={draft} option={o} />
      ))}

      {isGroupTour(draft) ? (
        <GroupCostingBlock draft={draft} set={set} options={includedOptions} />
      ) : totals.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Select at least one option above to see the comparison.</Card>
      ) : (

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Line</th>
              {totals.map((t) => (
                <th key={t.key} className="text-right p-2">Option {t.key} · {t.label || "—"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Room Cost (Net) DBL", (t: OptionTotals) => t.room_net_dbl],
              ["GST on Rooms DBL", (t: OptionTotals) => t.gst_rooms_dbl],
            ].map(([label, fn], i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{label as string}</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr((fn as any)(t))}</td>)}
              </tr>
            ))}
            {addonBreakdown.transport > 0 && (
              <tr className="border-t text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Transport</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.transport)}</td>)}
              </tr>
            )}
            {addonBreakdown.guides > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Guide</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.guides)}</td>)}
              </tr>
            )}
            {addonBreakdown.activities > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Activities</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.activities)}</td>)}
              </tr>
            )}
            {addonBreakdown.entrances > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Entrances</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.entrances)}</td>)}
              </tr>
            )}
            {addonBreakdown.misc > 0 && (
              <tr className="text-xs text-muted-foreground">
                <td className="p-2 pl-6">↳ Miscellaneous</td>
                {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(addonBreakdown.misc)}</td>)}
              </tr>
            )}
            <tr className="border-t font-medium">
              <td className="p-2">Add-Ons Total</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.addons_total)}</td>)}
            </tr>
            <tr className="border-t">
              <td className="p-2">{`Markup ${draft.markup_percent}% (DBL)`}</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.markup_dbl)}</td>)}
            </tr>
            <tr className="border-t">
              <td className="p-2">GST 5% (on subtotal + markup)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.gst5_dbl)}</td>)}
            </tr>
            <tr className="border-t bg-primary/5 font-bold">
              <td className="p-2">GRAND TOTAL (DBL)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums">{inr(t.grand_dbl)}</td>)}
            </tr>
            <tr className="border-t">
              <td className="p-2 text-xs text-muted-foreground">1 Person (Solo)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums text-xs">{inr(t.grand_sgl)}</td>)}
            </tr>
            <tr>
              <td className="p-2 text-xs text-muted-foreground">2 Persons (Per Head)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums text-xs">{inr(t.grand_dbl / 2)}</td>)}
            </tr>
            <tr>
              <td className="p-2 text-xs text-muted-foreground">3 Persons (Per Head)</td>
              {totals.map((t) => <td key={t.key} className="p-2 text-right tabular-nums text-xs">{inr(t.grand_trp / 3)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      )}


      <PerPersonSummaryBlock draft={draft} options={includedOptions} title="Per-Person Breakdown (Custom Allocation)" />

      <div className="text-xs text-muted-foreground italic">
        Inclusions & Exclusions are managed per option in Step 15.
      </div>
    </div>
  );
}

// ============================================================
// Group Costing block (Step 16, GIT tours)
// ============================================================
function GroupCostingBlock({ draft, set, options }: { draft: QuoteDraft; set: (p: Partial<QuoteDraft>) => void; options: HotelOption[] }) {
  const d = useDB();
  const pax = Math.max(1, totalPax(draft));
  const autoDbl = useMemo(() => autoDoubleMix(pax), [pax]);
  const autoTrp = useMemo(() => autoTripleMix(pax), [pax]);
  const customMix = draft.group_room_mix || autoDbl;

  const setCustom = (patch: Partial<typeof customMix>) => {
    set({ group_room_mix: { ...customMix, ...patch } });
  };

  const covered = mixCoversPax(customMix);
  const mismatch = covered !== pax;

  if (options.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">Select at least one option above to see the group costing.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-accent/5 border-accent/30">
        <div className="text-sm font-semibold text-accent-foreground mb-2">Customize Room Mix — {pax} pax</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Double Rooms</Label>
            <Input type="number" min={0} value={customMix.double}
              onChange={(e) => setCustom({ double: Math.max(0, parseInt(e.target.value) || 0) })} />
          </div>
          <div>
            <Label className="text-xs">Triple Rooms</Label>
            <Input type="number" min={0} value={customMix.triple}
              onChange={(e) => setCustom({ triple: Math.max(0, parseInt(e.target.value) || 0) })} />
          </div>
          <div>
            <Label className="text-xs">Single Rooms</Label>
            <Input type="number" min={0} value={customMix.single}
              onChange={(e) => setCustom({ single: Math.max(0, parseInt(e.target.value) || 0) })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => set({ group_room_mix: autoDoubleMix(pax) })}>All Double</Button>
            <Button size="sm" variant="outline" onClick={() => set({ group_room_mix: autoTripleMix(pax) })}>All Triple</Button>
          </div>
        </div>
        <div className={cn("mt-2 text-xs", mismatch ? "text-red-600 font-medium" : "text-muted-foreground")}>
          {mismatch
            ? `⚠ Room mix covers ${covered} persons but tour has ${pax}`
            : `✓ Room mix covers all ${pax} persons`}
        </div>
      </Card>

      {options.map((o) => {
        const dblTot = computeGroupOption(draft, o, d, autoDbl);
        const trpTot = computeGroupOption(draft, o, d, autoTrp);
        const custTot = computeGroupOption(draft, o, d, customMix);
        return (
          <Card key={o.key} className="p-4">
            <div className="text-sm font-semibold mb-3">
              Option {o.key} · {o.label || "—"} — Group Package for {pax} pax
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Line</th>
                    <th className="text-right p-2">Double Sharing<br /><span className="normal-case text-[10px] text-muted-foreground/80">{mixLabel(autoDbl)}</span></th>
                    <th className="text-right p-2">Triple Sharing<br /><span className="normal-case text-[10px] text-muted-foreground/80">{mixLabel(autoTrp)}</span></th>
                    <th className="text-right p-2">Custom Mix<br /><span className="normal-case text-[10px] text-muted-foreground/80">{mixLabel(customMix)}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Room Cost (Net)", (t: GroupOptionTotals) => t.room_net],
                    ["GST on Rooms", (t: GroupOptionTotals) => t.room_gst],
                    ["Add-Ons Total", (t: GroupOptionTotals) => t.addons_total],
                    [`Markup ${draft.markup_percent}%`, (t: GroupOptionTotals) => t.markup],
                    ["GST 5%", (t: GroupOptionTotals) => t.gst5],
                  ].map(([lbl, fn], i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{lbl as string}</td>
                      <td className="p-2 text-right tabular-nums">{inr((fn as any)(dblTot))}</td>
                      <td className="p-2 text-right tabular-nums">{inr((fn as any)(trpTot))}</td>
                      <td className="p-2 text-right tabular-nums">{inr((fn as any)(custTot))}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-primary/5 font-bold text-base">
                    <td className="p-2">GRAND TOTAL ({pax} pax)</td>
                    <td className="p-2 text-right tabular-nums">{inr(dblTot.grand_total)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(trpTot.grand_total)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(custTot.grand_total)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 text-xs text-muted-foreground">Per Person</td>
                    <td className="p-2 text-right tabular-nums text-xs">{inr(dblTot.per_person)}</td>
                    <td className="p-2 text-right tabular-nums text-xs">{inr(trpTot.per_person)}</td>
                    <td className="p-2 text-right tabular-nums text-xs">{inr(custTot.per_person)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(dblTot.rate_missing > 0 || trpTot.rate_missing > 0) && (
              <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {dblTot.rate_missing} night(s) missing rates
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}



// ============================================================
// STEP 17 — Final Costing
// ============================================================
function Step17({ draft, set }: StepProps) {
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
function PerPersonSummaryBlock({
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
  const pax = Math.max(1, totalPax(draft));
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
// ============================================================
function Step18({ draft, set }: StepProps) {
  const d = useDB();
  const user = useAuth();
  const [savedQuote, setSavedQuote] = useState<SavedQuote | null>(null);

  const routingCities = new Set(draft.routing.map((r) => d.cities.find((c) => c.id === r.city_id)?.name).filter(Boolean) as string[]);
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
function StepPaxType({ draft, set }: StepProps) {
  const isBrochure = draft.query_type === "Brochure";
  const totPax = draft.adults + draft.ss + draft.children.length;
  const autoTourType: "FIT" | "GIT" | "Brochure" = isBrochure ? "Brochure" : totPax <= 5 ? "FIT" : "GIT";
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
          Auto-detected — 1-5 pax = FIT, 6+ = GIT.
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

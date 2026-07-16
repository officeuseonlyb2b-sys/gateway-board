import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calculator, Check, ChevronLeft, ChevronRight, Save, Plus, Trash2,
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
import { cn } from "@/lib/utils";
import { inr, addDaysISO, fmtDateShort } from "@/lib/format";
import { useDB, MEAL_PLANS, type MealPlan } from "@/lib/mock-store";
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
} from "@/lib/wizard/types";
import { emptyDraft } from "@/lib/wizard/types";
import { useAgents, usePrograms, addAgent } from "@/lib/wizard/agents-store";
import { computeOption, computeAddonsTotal, totalPax, type OptionTotals } from "@/lib/wizard/calc";
import { findRatePlan, availableMealPlans } from "@/lib/wizard/rate-lookup";
import { defaultsForCategory } from "@/lib/wizard/category-defaults";
import { nextQuoteNumber, saveQuote as persistQuote, type SavedQuote } from "@/lib/quotes-store";
import { setActiveWizard } from "@/lib/wizard/active-wizard";
import { QuoteViewerDialog } from "@/components/QuoteViewerDialog";
import { QuickAddHotelDialog } from "@/components/QuickAddHotelDialog";

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

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 mt-6">
          <Card className="p-6 card-elevated">
            <StepContent draft={draft} set={set} />
          </Card>
          {step >= 5 && <SummarySidebar draft={draft} />}
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
  const [showNew, setShowNew] = useState(false);
  const [nAgent, setNAgent] = useState({ name: "", agency: "", phone: "", email: "" });

  if (draft.query_type === "B2B") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Agent Details</h2>
        <div>
          <Label>Select Agent</Label>
          <Select value={draft.agent.agent_id || ""} onValueChange={(id) => {
            const a = agents.find((x) => x.id === id);
            if (a) set({ agent: { agent_id: a.id, name: a.name, agency: a.agency, phone: a.phone, email: a.email } });
          }}>
            <SelectTrigger><SelectValue placeholder="Choose agent…" /></SelectTrigger>
            <SelectContent>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} — {a.agency}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Agent Name</Label><Input value={draft.agent.name} onChange={(e) => set({ agent: { ...draft.agent, name: e.target.value } })} /></div>
          <div><Label>Agency Name</Label><Input value={draft.agent.agency} onChange={(e) => set({ agent: { ...draft.agent, agency: e.target.value } })} /></div>
          <div><Label>Phone</Label><Input value={draft.agent.phone} onChange={(e) => set({ agent: { ...draft.agent, phone: e.target.value } })} /></div>
          <div><Label>Email</Label><Input value={draft.agent.email} onChange={(e) => set({ agent: { ...draft.agent, email: e.target.value } })} /></div>
        </div>
        {!showNew ? (
          <Button variant="outline" size="sm" onClick={() => setShowNew(true)}><Plus className="h-3 w-3 mr-1" /> Add New Agent</Button>
        ) : (
          <Card className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Name" value={nAgent.name} onChange={(e) => setNAgent({ ...nAgent, name: e.target.value })} />
              <Input placeholder="Agency" value={nAgent.agency} onChange={(e) => setNAgent({ ...nAgent, agency: e.target.value })} />
              <Input placeholder="Phone" value={nAgent.phone} onChange={(e) => setNAgent({ ...nAgent, phone: e.target.value })} />
              <Input placeholder="Email" value={nAgent.email} onChange={(e) => setNAgent({ ...nAgent, email: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                if (!nAgent.name) { toast.error("Agent name required"); return; }
                const a = addAgent(nAgent);
                set({ agent: { agent_id: a.id, ...nAgent } });
                setNAgent({ name: "", agency: "", phone: "", email: "" });
                setShowNew(false);
                toast.success("Agent added");
              }}>Save Agent</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </Card>
        )}
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Day-by-Day Routing</h2>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2 w-14">Day</th>
              <th className="text-left p-2 w-28">Date</th>
              <th className="text-left p-2">Overnight City</th>
              <th className="text-left p-2">Day's Program</th>
            </tr>
          </thead>
          <tbody>
            {draft.routing.map((r, i) => {
              const isLast = i === draft.routing.length - 1;
              const ents = entrancesForCity(r.city_id);
              return (
                <tr key={i} className="border-t align-top">
                  <td className="p-2 font-semibold">Day {r.day}</td>
                  <td className="p-2 text-xs">{fmtDateShort(r.date)}</td>
                  <td className="p-2">
                    {isLast ? (
                      <span className="text-xs text-muted-foreground italic">Departure</span>
                    ) : (
                      <Select value={r.city_id} onValueChange={(v) => updateRow(i, { city_id: v })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="City…" /></SelectTrigger>
                        <SelectContent>
                          {d.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
              );
            })}
          </tbody>
        </table>
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
  const total = draft.transport.reduce((s, l) => s + l.rate * l.vehicles * l.days, 0);
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
          onClick={() => set({ transport: [...draft.transport, { id: uid(), travel_id: opts[0]?.id || "", vehicles: 1, days: draft.nights + 1, rate: opts[0]?.rate_per_day || 0 }] })}
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
        // Ensure the currently-selected vehicle is always shown in its own row,
        // even if it falls outside the filter (e.g. saved before pax changed).
        const current = d.travel_options.find((x) => x.id === t.travel_id);
        const rowOpts = current && !opts.some((o) => o.id === current.id) ? [current, ...opts] : opts;
        return (
        <Card key={t.id} className="p-3 grid grid-cols-[1fr_80px_80px_100px_100px_36px] gap-2 items-end">
          <div>
            <Label className="text-xs">Vehicle</Label>
            <Select value={t.travel_id} onValueChange={(v) => {
              const to = rowOpts.find((x) => x.id === v);
              const next = [...draft.transport];
              next[i] = { ...t, travel_id: v, rate: to?.rate_per_day ? to.rate_per_day : t.rate };
              set({ transport: next });
            }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {rowOpts.map((o) => <SelectItem key={o.id} value={o.id}>{labelFor(o)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Vehicles</Label><Input type="number" min={1} value={t.vehicles}
            onChange={(e) => { const n = [...draft.transport]; n[i] = { ...t, vehicles: parseInt(e.target.value) || 1 }; set({ transport: n }); }} /></div>
          <div><Label className="text-xs">Days</Label><Input type="number" min={1} value={t.days}
            onChange={(e) => { const n = [...draft.transport]; n[i] = { ...t, days: parseInt(e.target.value) || 1 }; set({ transport: n }); }} /></div>
          <div><Label className="text-xs">Rate/day</Label><Input type="number" value={t.rate || ""} placeholder="Enter rate"
            onChange={(e) => { const n = [...draft.transport]; n[i] = { ...t, rate: parseFloat(e.target.value) || 0 }; set({ transport: n }); }} /></div>
          <div className="text-right"><Label className="text-xs">Total</Label><div className="text-sm font-semibold pt-2">{inr(t.rate * t.vehicles * t.days)}</div></div>
          <Button size="icon" variant="ghost" onClick={() => set({ transport: draft.transport.filter((x) => x.id !== t.id) })}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
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

  const toggle = (a: typeof relevant[number]) => {
    const existing = draft.activities.find((x) => x.activity_id === a.id);
    if (existing) set({ activities: draft.activities.filter((x) => x.id !== existing.id) });
    else set({ activities: [...draft.activities, { id: uid(), activity_id: a.id, qty: 1, rate: a.price }] });
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
    else set({ entrances: [...draft.entrances, { id: uid(), site_id: s.id, indian_pax: pax, indian_rate: s.indian_rate, foreign_pax: 0, foreign_rate: s.foreigner_rate }] });
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
                  <div className="text-xs text-muted-foreground">Indian ₹{s.indian_rate} / Foreign ₹{s.foreigner_rate}</div>
                </div>
              </div>
              {on && line && (
                <div className="mt-2 pl-8 grid grid-cols-4 gap-2 text-xs">
                  <div><Label className="text-[10px]">Indian Pax</Label><Input type="number" value={line.indian_pax}
                    onChange={(e) => set({ entrances: draft.entrances.map((x) => x.id === line.id ? { ...x, indian_pax: parseInt(e.target.value) || 0 } : x) })} /></div>
                  <div><Label className="text-[10px]">Foreign Pax</Label><Input type="number" value={line.foreign_pax}
                    onChange={(e) => set({ entrances: draft.entrances.map((x) => x.id === line.id ? { ...x, foreign_pax: parseInt(e.target.value) || 0 } : x) })} /></div>
                  <div className="col-span-2 text-right font-semibold pt-4">
                    {inr(line.indian_pax * line.indian_rate + line.foreign_pax * line.foreign_rate)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <CustomAdd label="Custom Entrance" onAdd={(name, rate) => set({
        entrances: [...draft.entrances, { id: uid(), custom_name: name, indian_pax: pax, indian_rate: rate, foreign_pax: 0, foreign_rate: 0 }],
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
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Guide Charges</h2>
        <Button size="sm" onClick={() => set({ guides: [...draft.guides, { id: uid(), guide_id: opts[0]?.id || "", days: 1, guides: 1, rate: opts[0]?.rate_per_day || 0 }] })}>
          <Plus className="h-3 w-3 mr-1" /> Add Guide
        </Button>
      </div>
      {draft.guides.map((g, i) => (
        <Card key={g.id} className="p-3 grid grid-cols-[1fr_80px_80px_100px_100px_36px] gap-2 items-end">
          <div>
            <Label className="text-xs">Guide</Label>
            <Select value={g.guide_id} onValueChange={(v) => {
              const go = opts.find((x) => x.id === v);
              const n = [...draft.guides]; n[i] = { ...g, guide_id: v, rate: go?.rate_per_day || g.rate };
              set({ guides: n });
            }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {opts.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} ({o.guide_type})</SelectItem>)}
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
  const overnightRouting = draft.routing.filter((r) => r.overnight && r.city_id);

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
            const cityName = d.cities.find((c) => c.id === day.city_id)?.name;
            const sel = activeOption.selections.find((s) => s.city_id === day.city_id);
            const cityHotels = d.hotels.filter((h) => h.city_id === day.city_id && h.hotel_category === activeCategory);
            const allCityHotels = d.hotels.filter((h) => h.city_id === day.city_id);
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
            <OptionCostPreview draft={draft} option={activeOption} />
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
  const gstFor = (v: number) => (v > 7500 ? 0.18 : 0.05);

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
    const transport = draft.transport.reduce((s, l) => s + l.rate * l.vehicles * l.days, 0);
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

      {totals.length === 0 ? (
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

      <div className="text-xs text-muted-foreground italic">
        Inclusions & Exclusions are managed per option in Step 15.
      </div>
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
    </div>
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
      const gr = (v: number) => v > 7500 ? 0.18 : 0.05;
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
            <div>{fmtDateShort(draft.start_date)} → {fmtDateShort(endDate)}</div>
            <div className="text-xs text-muted-foreground">{draft.nights}N / {draft.nights + 1}D</div>
          </div>
          <div><span className="text-muted-foreground text-xs">Pax</span>
            <div>{totalPax(draft)} ({draft.adults}A · {draft.ss}SS · {draft.children.length}C)</div>
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

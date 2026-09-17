import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { NewTaskDialog, ReassignQuery, useActor } from "@/components/crm/assign";
import { inr, paxRangeLabel } from "@/components/crm/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccessibleQueries, useAccessProfile } from "@/lib/crm/access";
import { durationLabel, queryClock } from "@/lib/crm/insights";
import {
  assignmentHistory,
  logLeadActivity,
  scheduleFollowup,
  setQueryStage,
  useCrmEvents,
  useCrmTasks,
} from "@/lib/crm/store";
import { LIFECYCLE, STAGES, type CrmEventType, type Stage } from "@/lib/crm/types";
import { usePrograms } from "@/lib/wizard/agents-store";

const TABS = [
  "Overview",
  "Program Info",
  "Commercials",
  "Itinerary & Costings",
  "Lifecycle Progress",
  "Latest Activity",
  "Follow-ups / Next Steps",
] as const;
type Tab = (typeof TABS)[number];
const LOST_REASONS = [
  "Budget mismatch",
  "No response",
  "Travel cancelled",
  "Competitor selected",
  "Dates unavailable",
  "Duplicate query",
  "Other",
];
const fmt = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—";
const dateOnly = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-semibold text-slate-900">{children || "—"}</div>
    </div>
  );
}

export default function QueryWorkspace() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const actor = useActor();
  const access = useAccessProfile();
  const query = useAccessibleQueries().find((item) => item.id === id || item.query_id === id);
  const allEvents = useCrmEvents();
  const tasks = useCrmTasks().filter((task) => task.query_id === query?.query_id);
  const programs = usePrograms();
  const [tab, setTab] = useState<Tab>("Overview");
  const [activityOpen, setActivityOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [medium, setMedium] = useState("Phone");
  const [activityNote, setActivityNote] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [newStage, setNewStage] = useState<Stage | "">("");
  const [lostReason, setLostReason] = useState("");
  const [closureNote, setClosureNote] = useState("");
  const events = useMemo(
    () =>
      allEvents
        .filter((event) => event.query_id === query?.query_id)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [allEvents, query?.query_id],
  );
  const program = programs.find(
    (item) => item.id === query?.program_id || item.name === query?.program_name,
  );
  const versions = [...(query?.costing_versions || [])].sort((a, b) => b.version - a.version);

  if (!query)
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-10 text-center">
            <h1 className="text-xl font-bold">Query not found</h1>
            <Button className="mt-4" onClick={() => navigate({ to: "/queries/query-tracker" })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  const submitActivity = () => {
    if (!activityNote.trim()) return toast.error("Add an outcome or note.");
    const type: CrmEventType =
      medium === "Email" ? "email_sent" : medium === "WhatsApp" ? "whatsapp_sent" : "call_made";
    logLeadActivity(query.query_id, type, {
      by: actor,
      title: `${medium} activity logged`,
      detail: activityNote.trim(),
    });
    if (nextDue)
      scheduleFollowup(
        query.query_id,
        new Date(`${nextDue}T10:00:00`).toISOString(),
        activityNote.trim(),
        actor,
      );
    setActivityNote("");
    setNextDue("");
    setActivityOpen(false);
    toast.success("Activity logged");
  };

  const submitStatus = () => {
    if (!newStage) return;
    if (newStage === "Lost" && !lostReason) return toast.error("Select a Lost reason.");
    try {
      setQueryStage(query.query_id, newStage, actor, { reason: lostReason, notes: closureNote });
      if (newStage === "Won") setCelebrate(true);
      setStatusOpen(false);
      setNewStage("");
      setLostReason("");
      setClosureNote("");
      toast.success(`Query moved to ${newStage}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status could not be changed.");
    }
  };

  const bottom = query.commercials.bottom_line ?? query.commercials.cost_price;
  const top = query.commercials.top_line ?? query.commercials.selling_price ?? query.value;
  const routeText =
    query.routing ||
    program?.routing
      .map((row) => row.overnight_city)
      .filter(Boolean)
      .join(" → ") ||
    query.destination;
  const lifecycleAt = (label: string) => query.lifecycle.find((step) => step.label === label)?.at;
  const clock = queryClock(query);

  const LifecycleClock = () => (
    <Card>
      <CardHeader>
        <CardTitle>Lifecycle Clock</CardTitle>
        <p className="text-xs text-slate-500">
          Operational elapsed time from recorded Query events
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          [
            "Assignment wait",
            durationLabel(clock.assignmentWait),
            query.assigned_at ? "Recorded" : "Still waiting",
          ],
          [
            "First response",
            clock.firstResponse === null ? "Pending" : durationLabel(clock.firstResponse),
            "After assignment",
          ],
          [
            "Quotation TAT",
            clock.quotationTat === null ? "Pending" : durationLabel(clock.quotationTat),
            "From Query receipt",
          ],
          ["Current stage age", durationLabel(clock.stageAge), query.stage],
          ["Total Query age", durationLabel(clock.queryAge), query.work_status || "Open"],
          [
            "Sales cycle",
            clock.salesCycle === null ? "In progress" : durationLabel(clock.salesCycle),
            "Receipt to closure",
          ],
        ].map(([label, value, helper]) => (
          <div key={label} className="rounded-xl border bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
            <p className="text-xs text-slate-500">{helper}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const ProgramCard = () => (
    <Card>
      <CardHeader>
        <CardTitle>Program Snapshot</CardTitle>
        <p className="text-xs text-slate-500">Selected programme and routing</p>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
            {program?.id || query.program_id || "Program pending"}
          </p>
          <h3 className="mt-2 text-xl font-bold">
            {program?.name || query.program_name || query.destination || "Not selected"}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {routeText || "Routing is not yet defined."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(program?.categories || []).map((category) => (
              <Badge key={category} variant="outline" className="bg-white">
                {category}
              </Badge>
            ))}
            <Badge className="bg-teal-700">MP Unit</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ActivityCard = ({ limit }: { limit?: number }) => (
    <Card>
      <CardHeader>
        <CardTitle>Latest Activity</CardTitle>
        <p className="text-xs text-slate-500">Actual Query audit history</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.length === 0 && <p className="text-sm text-slate-500">No activity recorded.</p>}
        {events.slice(0, limit).map((event) => (
          <div key={event.id} className="flex gap-3 border-b pb-3 last:border-0">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-teal-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{event.title}</p>
              <p className="text-xs text-slate-500">{event.detail}</p>
            </div>
            <p className="whitespace-nowrap text-xs text-slate-400">{fmt(event.at)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  const LifecycleCard = () => (
    <Card>
      <CardHeader>
        <CardTitle>Lifecycle Progress</CardTitle>
        <p className="text-xs text-slate-500">Only recorded milestones are dated</p>
      </CardHeader>
      <CardContent className="space-y-0">
        {LIFECYCLE.map((label, index) => {
          const at = lifecycleAt(label);
          const reached =
            Boolean(at) || (label === "Won / Lost" && ["Won", "Lost"].includes(query.stage));
          return (
            <div key={label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${reached ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}
                >
                  {reached ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </span>
                {index < LIFECYCLE.length - 1 && (
                  <span className={`h-10 w-px ${reached ? "bg-teal-500" : "bg-slate-200"}`} />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-slate-500">
                  {at
                    ? fmt(at)
                    : label === "Won / Lost" && query.closed_at
                      ? fmt(query.closed_at)
                      : "Pending"}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-[#043b3a] via-[#0a5c59] to-[#098f8b] p-6 text-white shadow-lg">
          <div className="flex flex-col justify-between gap-4 lg:flex-row">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-teal-100">{query.query_id}</span>
                <Badge className="bg-white text-slate-900">{query.stage}</Badge>
                <Badge variant="outline" className="border-white/40 text-white">
                  {query.assignment_status}
                </Badge>
              </div>
              <h1 className="mt-2 text-3xl font-bold">{query.customer}</h1>
              <p className="mt-1 text-sm text-teal-100">
                Received {fmt(query.created_at)} ·{" "}
                {query.owner ? `Owned by ${query.owner}` : "Awaiting manager assignment"} ·{" "}
                {query.primary_unit} Unit
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="bg-white text-teal-800" onClick={() => setActivityOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Action
              </Button>
              <NewTaskDialog
                queryId={query.query_id}
                trigger={
                  <Button variant="outline" className="border-white/40 bg-transparent text-white">
                    Add Task
                  </Button>
                }
              />
              <Button
                variant="outline"
                className="border-white/40 bg-transparent text-white"
                onClick={() => setStatusOpen(true)}
              >
                Update Stage
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate({ to: "/queries/query-tracker" })}
              >
                <ArrowLeft />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-5">
          <Fact label="Travellers">
            {paxRangeLabel(query)}
          </Fact>
          <Fact label="Destination">{query.destination}</Fact>
          <Fact label="Travel dates">
            {dateOnly(query.travel_start)} – {dateOnly(query.travel_end)}
          </Fact>
          <Fact label="Costing basis">{query.costing_basis || query.travel_type}</Fact>
          <Fact label="Owner">
            {access.canAssign ? (
              <ReassignQuery queryId={query.query_id} owner={query.owner} />
            ) : (
              query.owner || "Awaiting Assignment"
            )}
          </Fact>
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-xl border bg-white px-3 pt-2">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${tab === item ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500"}`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Query Overview</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <Fact label="Partner / Client">
                    {query.customer} · {query.customer_type}
                  </Fact>
                  <Fact label="Contact">
                    {query.contact_person}
                    <br />
                    {query.mobile} · {query.email}
                  </Fact>
                  <Fact label="Query nature">
                    {query.enquiry_type} · {query.requirement}
                  </Fact>
                  <Fact label="Source / market">
                    {query.query_market_source || query.customer_type} ·{" "}
                    {query.query_source_type || query.lead_source} · {query.market || "—"}
                  </Fact>
                  <Fact label="Base city / conversation">
                    {query.query_base_city || "—"} · {query.conversation_medium || "—"}
                  </Fact>
                  <Fact label="Tour route">
                    {query.tour_start_city || "—"} → {query.tour_end_city || "—"}
                  </Fact>
                  <Fact label="Commercial opportunity">
                    {inr(bottom)} → {inr(top)}
                  </Fact>
                  <Fact label="Next action">
                    {query.next_action || "Not set"} · {fmt(query.followup_due)}
                  </Fact>
                  <Fact label="Assignment">
                    Created by {query.created_by || "—"}
                    <br />
                    Assigned by {query.assigned_by || "—"}
                  </Fact>
                </CardContent>
              </Card>
              <LifecycleClock />
              <ProgramCard />
              <ActivityCard limit={5} />
            </div>
            <div className="space-y-6">
              <LifecycleCard />
              <Card>
                <CardHeader>
                  <CardTitle>Commercial Snapshot</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500">BOTTOM LINE</p>
                      <p className="text-2xl font-bold text-teal-700">{inr(bottom)}</p>
                      <p className="text-xs text-slate-500">
                        {(query.min_pax || query.pax) ? `${query.min_pax || query.pax} pax` : "Pax pending"} ·{" "}
                        {query.hotel_category_from || "category pending"}
                      </p>
                    </div>
                    <span className="text-2xl text-teal-600">→</span>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">TOP LINE</p>
                      <p className="text-2xl font-bold">{inr(top)}</p>
                      <p className="text-xs text-slate-500">
                        {(query.max_pax || query.pax) ? `${query.max_pax || query.pax} pax` : "Pax pending"} ·{" "}
                        {query.hotel_category_to || "category pending"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Follow-ups / Next Step</CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-lg font-bold ${query.followup_due && new Date(query.followup_due) < new Date() ? "text-red-600" : "text-slate-900"}`}
                  >
                    {query.followup_due ? fmt(query.followup_due) : "Not scheduled"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {query.followup_note || query.next_action}
                  </p>
                  <Button className="mt-4" onClick={() => setActivityOpen(true)}>
                    Log & schedule
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {tab === "Program Info" && (
          <div className="space-y-6">
            <ProgramCard />
            <Card>
              <CardHeader>
                <CardTitle>Program Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <Fact label="Program code">{program?.id || query.program_id}</Fact>
                <Fact label="Program name">{program?.name || query.program_name}</Fact>
                <Fact label="Region">
                  {query.program_region || query.destination} · {query.primary_unit}
                </Fact>
                <Fact label="Program type">{query.program_type || "—"}</Fact>
                <Fact label="Duration">{program ? `${program.nights} nights` : "—"}</Fact>
                <Fact label="Starting city">
                  {program?.departure_city || query.tour_start_city || "—"}
                </Fact>
                <Fact label="Ending city">{query.tour_end_city || "—"}</Fact>
                <Fact label="Travel period">{query.travel_period || "—"}</Fact>
                <Fact label="Travel modes">{program?.travel_modes?.join(", ")}</Fact>
                <div className="md:col-span-3">
                  <Fact label="Routing">{routeText}</Fact>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {tab === "Commercials" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Opportunity Range</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Fact label="Bottom line">{inr(bottom)}</Fact>
                <Fact label="Top line">{inr(top)}</Fact>
                <Fact label="Per person package">{inr(query.per_person_package_cost || 0)}</Fact>
                <Fact label="Hotel categories">
                  {query.hotel_category_from || "—"} → {query.hotel_category_to || "—"}
                </Fact>
                <Fact label="Costing basis">{query.costing_basis || query.travel_type}</Fact>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Latest Final Commercial</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Fact label="Final cost">
                  {inr(query.commercials.final_cost || query.commercials.cost_price)}
                </Fact>
                <Fact label="Final selling">
                  {inr(query.commercials.final_selling || query.commercials.selling_price)}
                </Fact>
                <Fact label="Margin">{inr(query.commercials.margin_value || 0)}</Fact>
                <Fact label="Margin %">{(query.commercials.margin_pct || 0).toFixed(1)}%</Fact>
              </CardContent>
            </Card>
          </div>
        )}
        {tab === "Itinerary & Costings" && (
          <div className="space-y-5">
            <div className="flex justify-between">
              <div>
                <h2 className="text-2xl font-bold">Itinerary & Costing Versions</h2>
                <p className="text-sm text-slate-500">
                  Every saved linked Costing is retained as a Query version.
                </p>
              </div>
              <Button
                onClick={() => navigate({ to: "/costing", search: { queryId: query.query_id } })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create linked costing
              </Button>
            </div>
            {versions.length === 0 && (
              <Card>
                <CardContent className="p-10 text-center text-slate-500">
                  No linked costing version yet.
                </CardContent>
              </Card>
            )}
            {versions.map((version) => (
              <Card key={version.version}>
                <CardContent className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
                  <div>
                    <p className="font-bold">
                      Costing V{version.version} · {version.quote.quote_number}
                    </p>
                    <p className="text-sm text-slate-500">
                      Saved {fmt(version.saved_at)} by {version.saved_by}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(version.quote, null, 2)], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${query.query_id}-costing-v${version.version}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                    {version.draft_id && (
                      <Button
                        onClick={() =>
                          navigate({ to: "/costing", search: { id: version.draft_id } })
                        }
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Edit version
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {tab === "Lifecycle Progress" && (
          <div className="space-y-6">
            <LifecycleClock />
            <div className="grid gap-6 lg:grid-cols-2">
              <LifecycleCard />
              <Card>
                <CardHeader>
                  <CardTitle>Assignment History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assignmentHistory(query.query_id).map((event) => (
                    <div key={event.id} className="rounded-lg border p-3">
                      <p className="font-semibold">
                        {event.assigned_from ? `${event.assigned_from} → ` : ""}
                        {event.assigned_to}
                      </p>
                      <p className="text-xs text-slate-500">
                        {fmt(event.at)} · by {event.by}
                        {event.assign_reason ? ` · ${event.assign_reason}` : ""}
                      </p>
                    </div>
                  ))}
                  {!assignmentHistory(query.query_id).length && (
                    <p className="text-sm text-slate-500">Awaiting first assignment.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        {tab === "Latest Activity" && <ActivityCard />}
        {tab === "Follow-ups / Next Steps" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Next accountable action</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {query.followup_due ? fmt(query.followup_due) : "Not scheduled"}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {query.followup_note || query.next_action}
                </p>
                <Button className="mt-5" onClick={() => setActivityOpen(true)}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Log outcome & schedule next
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Common Task Engine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-lg border p-3">
                    <div className="flex justify-between">
                      <p className="font-semibold">{task.title}</p>
                      <Badge variant={task.done ? "secondary" : "outline"}>
                        {task.done ? "Closed" : task.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      Owner {task.owner} · due {fmt(task.due_at)}
                    </p>
                  </div>
                ))}
                <NewTaskDialog
                  queryId={query.query_id}
                  trigger={
                    <Button variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Add task
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log communication / follow-up</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Medium</Label>
              <Select value={medium} onValueChange={setMedium}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Phone", "Email", "WhatsApp", "Meeting"].map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Outcome / note</Label>
              <Textarea
                value={activityNote}
                onChange={(event) => setActivityNote(event.target.value)}
              />
            </div>
            <div>
              <Label>Next follow-up date</Label>
              <Input
                type="date"
                value={nextDue}
                onChange={(event) => setNextDue(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitActivity}>
              {medium === "Email" ? (
                <Mail className="mr-2 h-4 w-4" />
              ) : medium === "WhatsApp" ? (
                <MessageCircle className="mr-2 h-4 w-4" />
              ) : (
                <Phone className="mr-2 h-4 w-4" />
              )}
              Save activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Sales lifecycle stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New stage</Label>
              <Select value={newStage} onValueChange={(value) => setNewStage(value as Stage)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newStage === "Lost" && (
              <div>
                <Label>Lost reason (required)</Label>
                <Select value={lostReason} onValueChange={setLostReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOST_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Internal note</Label>
              <Textarea
                value={closureNote}
                onChange={(event) => setClosureNote(event.target.value)}
              />
            </div>
            {newStage === "Won" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Won creates an Operations handoff in “Awaiting Operations Acceptance”.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitStatus}>Update stage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={celebrate} onOpenChange={setCelebrate}>
        <DialogContent className="text-center">
          <div className="py-8">
            <div className="text-7xl">🎉</div>
            <Sparkles className="mx-auto mt-3 h-8 w-8 text-amber-500" />
            <DialogTitle className="mt-4 text-3xl">Query Won!</DialogTitle>
            <p className="mt-2 text-slate-500">
              {query.query_id} is now in the Operations handoff queue.
            </p>
            <Button className="mt-6" onClick={() => setCelebrate(false)}>
              <UserRoundCheck className="mr-2 h-4 w-4" />
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

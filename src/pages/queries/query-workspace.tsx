import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CalendarClock,
  Mail,
  MapPin,
  Users,
  Briefcase,
  FileText,
  Phone,
  RefreshCcw,
  Search,
  TrendingUp,
  MessageSquare,
  StickyNote,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useCrmMetrics } from "@/lib/crm/metrics";
import { addNote, logFollowup, setQueryStage } from "@/lib/crm/store";
import type { CrmQuery, Stage } from "@/lib/crm/types";

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

const STAGES: Stage[] = [
  "New",
  "Requirement Review",
  "Costing",
  "Quotation Sent",
  "Follow-up",
  "Nurturing",
  "Confirmed",
  "Lost",
];

function formatMoney(value: number) {
  const amount = Number(value) || 0;
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)} L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)} K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function stageBadgeClass(stage: Stage) {
  switch (stage) {
    case "Confirmed": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Lost": return "bg-red-50 text-red-700 border-red-200";
    case "Nurturing": return "bg-orange-50 text-orange-700 border-orange-200";
    case "Follow-up": return "bg-violet-50 text-violet-700 border-violet-200";
    case "Quotation Sent": return "bg-blue-50 text-blue-700 border-blue-200";
    case "Costing": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Requirement Review": return "bg-indigo-50 text-indigo-700 border-indigo-200";
    default: return "bg-sky-50 text-sky-700 border-sky-200";
  }
}

export default function QueryWorkspace() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { id?: string; queryId?: string };
  const queryId = params.id || params.queryId || "";
  const m = useCrmMetrics();

  const query = useMemo(
    () => m.queries.find((item) => item.id === queryId || item.query_id === queryId),
    [m.queries, queryId],
  );

  const [tab, setTab] = useState<Tab>("Overview");
  const [note, setNote] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [nextDate, setNextDate] = useState("");

  if (!query) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-semibold">Query not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">The requested CRM query could not be found.</p>
            <Button className="mt-5" onClick={() => navigate({ to: "/queries/query-tracker" })}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Query Tracker
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activities = m.events
    .filter((event) => event.query_id === query.query_id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const currentActor = query.owner || "System";
  const status = query.stage;

  const saveNote = () => {
    if (!note.trim()) return;
    addNote(query.query_id, note.trim(), currentActor);
    setNote("");
  };

  const handleLogFollowup = () => {
    if (!nextDate) return;
    const date = new Date(nextDate);
    if (Number.isNaN(date.getTime())) return;
    logFollowup(query.query_id, followupNote.trim() || "Follow-up logged", date.toISOString(), currentActor);
    setFollowupNote("");
    setNextDate("");
  };

  const changeStage = (value: string) => {
    setQueryStage(query.query_id, value as Stage, currentActor);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      {/* TOP HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-blue-600">{query.query_id}</span>
            <Badge variant="outline" className={`px-2 py-0 ${stageBadgeClass(status)}`}>{status}</Badge>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">{query.customer || "Direct Query"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Received {formatDate(query.created_at)} • Owned by {query.owner || "Unassigned"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button className="bg-teal-600 hover:bg-teal-700 text-white">
            <PlusIcon className="mr-2 h-4 w-4" /> Add Action
          </Button>
          <Select value={status} onValueChange={changeStage}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200 text-slate-700">
              <SelectValue placeholder="Update Status" />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/queries/query-tracker" })}>
            <XIcon className="h-5 w-5 text-slate-400" />
          </Button>
        </div>
      </div>

      {/* INFO BAR */}
      <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <span>{query.pax || 0} Pax</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-400" />
          <span>{query.destination || "Destination not set"}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-400" />
          <span>{formatDate(query.travel_start)} – {formatDate(query.travel_end)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-slate-400" />
          <span>{query.enquiry_type || "FIT"}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-teal-600" />
          <span>{status}</span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-6 border-b border-slate-200 overflow-x-auto pb-0">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors ${
              tab === item ? "border-b-2 border-teal-600 text-teal-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div className="mt-6">
        {/* OVERVIEW */}
        {tab === "Overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <Card className="xl:col-span-2 border-slate-200">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-slate-900">Query Overview</h2>
                <p className="text-xs text-muted-foreground mb-6">The main facts, current stage and immediate action</p>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Travel partner</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{query.customer || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Contact person</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{query.contact_person || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Mobile / Email</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{query.mobile || "—"}</p>
                      <p className="text-xs text-muted-foreground break-all">{query.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Market / Source</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{query.market || "—"} • {query.lead_source || "—"}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Travel dates</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(query.travel_start)} – {formatDate(query.travel_end)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Traveller range</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{query.pax || 0} pax</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Current stage</p>
                      <Badge variant="outline" className={`mt-1 px-2 py-0 ${stageBadgeClass(status)}`}>{status}</Badge>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Next action</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{query.next_action || "No open action"}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lifecycle Sidebar */}
            <Card className="border-slate-200">
              <CardContent className="p-6">
                <h2 className="text-lg font-bold text-slate-900">Lifecycle Progress</h2>
                <p className="text-xs text-muted-foreground mb-6">{status} • {activities.length} recorded activities</p>

                <div className="space-y-0">
                  {STAGES.filter(s => s !== "Confirmed" && s !== "Lost").map((stage, idx) => {
                    const isReached = STAGES.indexOf(status) >= STAGES.indexOf(stage);
                    const isCurrent = status === stage;
                    const lastDate = activities.find((act) => act.to_stage === stage)?.at;

                    return (
                      <div key={stage} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isReached ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                            {isReached ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                          </div>
                          {idx < STAGES.filter(s => s !== "Confirmed" && s !== "Lost").length - 1 && (
                            <div className={`w-px flex-1 min-h-[40px] ${isReached ? "bg-teal-600" : "bg-slate-200"}`}></div>
                          )}
                        </div>
                        <div className="pb-6">
                          <p className="text-sm font-semibold text-slate-900">{stage}</p>
                          <p className="text-xs text-slate-500">{lastDate ? formatDate(lastDate) : "Pending"}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-4 items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Circle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Confirmed / Lost</p>
                      <p className="text-xs text-slate-500">Pending</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* PROGRAM INFO */}
        {tab === "Program Info" && (
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardContent className="p-6">
                <p className="text-xs font-bold text-teal-700 uppercase mb-2">Program Information</p>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{query.interested_program_name || "Cultural Heritage, Wildlife & Marble Rocks Escapade"}</h2>
                    <p className="text-sm text-slate-500 mt-1">{query.interested_program_routing || "Ex Jlr | Jlr (1N) - Hjr (1N) - Ban (2N) - Jlr"}</p>
                  </div>
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{query.interested_program_code || "EXJBP07"}</Badge>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Programme identity</h3>
                  <p className="text-xs text-muted-foreground mb-4">Catalogue classification</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Programme code</p>
                      <p className="text-sm font-bold text-slate-900">{query.interested_program_code || "EXJBP07"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Programme name</p>
                      <p className="text-sm font-bold text-slate-900">{query.interested_program_name || "Cultural Heritage, Wildlife & Marble Rocks Escapade"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Programme type</p>
                      <p className="text-sm font-bold text-slate-900">{query.program_type || "Quick Getaways"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Programme region</p>
                      <p className="text-sm font-bold text-slate-900">{query.program_region || "North + East MP"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Travel framework</h3>
                  <p className="text-xs text-muted-foreground mb-4">Dates, duration and journey</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Travel dates</p>
                      <p className="text-sm font-bold text-slate-900">{formatDate(query.travel_start)} – {formatDate(query.travel_end)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Duration</p>
                      <p className="text-sm font-bold text-slate-900">{query.duration_days || "7 Nights & 8 Days"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Start city</p>
                      <p className="text-sm font-bold text-slate-900">{query.tour_starting_city || "Khajuraho"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">End city</p>
                      <p className="text-sm font-bold text-slate-900">{query.tour_ending_city || "Jabalpur"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* COMMERCIALS */}
        {tab === "Commercials" && (
          <div className="space-y-6">
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="p-6">
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Bottom-line Query Value</p>
                    <p className="text-2xl font-bold text-teal-700 mt-1">{formatMoney(query.value)}</p>
                    <p className="text-xs text-slate-500">{query.pax || 0} pax • ₹14,500 • 4 Star</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Top-line Query Value</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{formatMoney(query.value)}</p>
                    <p className="text-xs text-slate-500">{query.pax || 0} pax • ₹14,500 • 4 Star</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Bottom-line scenario</h3>
                  <p className="text-xs text-muted-foreground mb-4">Lowest qualifying quotation</p>
                  <div className="border-2 border-teal-600 rounded-lg p-4 bg-teal-50/20">
                    <p className="text-xs font-bold text-teal-700 uppercase">Entry Scenario</p>
                    <p className="text-2xl font-bold text-teal-700 mt-2">{formatMoney(query.value)}</p>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Travellers</p><p className="text-sm font-bold">{query.pax || 0} pax</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Hotel</p><p className="text-sm font-bold">4 Star</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Rate / person</p><p className="text-sm font-bold">₹14,500</p></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Top-line scenario</h3>
                  <p className="text-xs text-muted-foreground mb-4">Highest qualifying quotation</p>
                  <div className="border-2 border-slate-300 rounded-lg p-4 bg-slate-50/20">
                    <p className="text-xs font-bold text-slate-600 uppercase">Maximum Scenario</p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">{formatMoney(query.value)}</p>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Travellers</p><p className="text-sm font-bold">{query.pax || 0} pax</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Hotel</p><p className="text-sm font-bold">4 Star</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Rate / person</p><p className="text-sm font-bold">₹14,500</p></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ITINERARY & COSTINGS */}
        {tab === "Itinerary & Costings" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-teal-700 uppercase">Version Control</p>
                <h2 className="text-2xl font-bold text-slate-900">Itineraries & Costings</h2>
                <p className="text-sm text-slate-500">Every generated version stays available for review, editing and download.</p>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white">+ New Version</Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Itinerary versions</h3>
                  <p className="text-xs text-muted-foreground mb-4">Programme documents shared or prepared</p>
                  <div className="space-y-4">
                    <div className="flex gap-4 border rounded-lg p-4">
                      <div className="bg-blue-50 p-3 rounded"><FileText className="h-6 w-6 text-blue-600" /></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold">Itinerary V2</p>
                          <Badge className="bg-teal-100 text-teal-700 border-0">CURRENT</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Cultural Heritage, Wildlife & Marble Rocks Escapade - latest working route</p>
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 07 Sept 2026 - Chhaya Prajapati</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">Download</Button>
                      </div>
                    </div>
                    
                    <div className="flex gap-4 border rounded-lg p-4 opacity-60">
                      <div className="bg-blue-50 p-3 rounded"><FileText className="h-6 w-6 text-blue-600" /></div>
                      <div className="flex-1">
                        <p className="font-bold">Itinerary V1</p>
                        <p className="text-xs text-slate-500 mt-1">Initial requirement and routing draft</p>
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 03 Sept 2026 - Chhaya Prajapati</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">Download</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Costing versions</h3>
                  <p className="text-xs text-muted-foreground mb-4">Scenario calculations and quotation history</p>
                  <div className="space-y-4">
                    <div className="flex gap-4 border rounded-lg p-4">
                      <div className="bg-teal-50 p-3 rounded"><TrendingUp className="h-6 w-6 text-teal-600" /></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold">Costing V2</p>
                          <Badge className="bg-teal-100 text-teal-700 border-0">CURRENT</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{formatMoney(query.value)} • FIT</p>
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 07 Sept 2026 - Chhaya Prajapati</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">Download</Button>
                      </div>
                    </div>

                    <div className="flex gap-4 border rounded-lg p-4 opacity-60">
                      <div className="bg-teal-50 p-3 rounded"><TrendingUp className="h-6 w-6 text-teal-600" /></div>
                      <div className="flex-1">
                        <p className="font-bold">Costing V1</p>
                        <p className="text-xs text-slate-500 mt-1">Initial 2 pax costing scenario</p>
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 03 Sept 2026 - Chhaya Prajapati</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="outline" size="sm">Download</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* LIFECYCLE PROGRESS */}
        {tab === "Lifecycle Progress" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <Card className="xl:col-span-2 border-slate-200">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-xs font-bold text-teal-700 uppercase">Query Journey</p>
                    <h2 className="text-2xl font-bold text-slate-900">Lifecycle Progress</h2>
                    <p className="text-sm text-slate-500">From generation and assignment through costing, follow-up and the final outcome.</p>
                  </div>
                  <Badge variant="outline" className={`${stageBadgeClass(status)}`}>{status}</Badge>
                </div>

                <p className="text-xs font-semibold text-slate-500 mb-6">Current stage: {status}</p>
                
                <div className="space-y-0">
                  {STAGES.filter(s => s !== "Confirmed" && s !== "Lost").map((stage, idx) => {
                    const isReached = STAGES.indexOf(status) >= STAGES.indexOf(stage);
                    const lastDate = activities.find((act) => act.to_stage === stage)?.at;

                    return (
                      <div key={stage} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isReached ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                            {isReached ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                          </div>
                          <div className={`w-px flex-1 min-h-[50px] ${isReached && idx < 4 ? "bg-teal-600" : "bg-slate-200"}`}></div>
                        </div>
                        <div className="pb-6 pt-1">
                          <p className="font-bold text-slate-900">{stage}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{lastDate ? formatDate(lastDate) : "Pending"}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-4 items-center pt-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Circle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Confirmed / Lost</p>
                      <p className="text-xs text-slate-500">Pending</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-slate-900 mb-4">Lifecycle summary</h3>
                <p className="text-xs text-muted-foreground mb-6">Key accountability signals</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Owner</p>
                    <p className="text-sm font-bold text-slate-900">{query.owner || "Unassigned"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Days in pipeline</p>
                    <p className="text-sm font-bold text-slate-900">5</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Follow-ups</p>
                    <p className="text-sm font-bold text-slate-900">{activities.filter(a => a.type.includes('followup')).length || 1}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Outcome</p>
                    <p className="text-sm font-bold text-slate-900">{status}</p>
                  </div>
                </div>

                <div className="mt-4 bg-teal-50 rounded-lg p-4">
                  <p className="text-[10px] font-bold text-teal-700 uppercase">Next control point</p>
                  <p className="font-bold text-slate-900 mt-1">Action not scheduled</p>
                  <p className="text-xs text-slate-500 mt-1">No closure reason recorded.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* LATEST ACTIVITY */}
        {tab === "Latest Activity" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-teal-700 uppercase">Audit Trail</p>
                <h2 className="text-2xl font-bold text-slate-900">Latest Activity</h2>
                <p className="text-sm text-slate-500">A single chronological history of calls, emails, status updates and internal progress.</p>
              </div>
              <Button variant="outline" className="border-teal-600 text-teal-700 hover:bg-teal-50">+ Log Activity</Button>
            </div>

            <Card className="border-slate-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-slate-900">Complete activity history</h3>
                <p className="text-xs text-muted-foreground mb-6">{activities.length} recorded events</p>

                <div className="space-y-6">
                  {activities.length === 0 && <p className="text-sm text-slate-500">No activity recorded yet.</p>}
                  {activities.map((event, idx) => (
                    <div key={event.id} className="flex gap-4">
                      <div className={`h-3 w-3 rounded-full mt-1.5 ${idx === 0 ? "bg-orange-400" : "bg-blue-500"}`}></div>
                      <div className="flex-1 border-b border-slate-100 pb-4">
                        <div className="flex justify-between">
                          <p className="font-semibold text-slate-900">{event.title || event.type}</p>
                          <p className="text-xs text-slate-500">{formatDate(event.at)}</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{event.by || "System"} • {event.detail || ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* FOLLOW-UPS / NEXT STEPS */}
        {tab === "Follow-ups / Next Steps" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-teal-700 uppercase">Action Desk</p>
                <h2 className="text-2xl font-bold text-slate-900">Follow-ups / Next Steps</h2>
                <p className="text-sm text-slate-500">Make the next commitment, due date and conversation history explicit.</p>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white">+ Add Follow-up</Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              <Card className="xl:col-span-2 border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900 mb-4">Next action</h3>
                  <p className="text-xs text-muted-foreground mb-4">The next accountable client touchpoint</p>
                  
                  <div className="bg-[#043b3a] rounded-lg p-6 text-white">
                    <p className="text-xs font-bold opacity-70 uppercase">Due Date</p>
                    <p className="text-3xl font-bold mt-2">No action scheduled</p>
                    <p className="text-sm opacity-80 mt-2">Owner: {query.owner || "Unassigned"} • Email</p>
                    <Button className="mt-4 bg-white text-[#043b3a] hover:bg-slate-100">
                      Log outcome & schedule next
                    </Button>
                  </div>

                  <div className="mt-6 space-y-3">
                    <Textarea
                      value={followupNote}
                      onChange={(e) => setFollowupNote(e.target.value)}
                      placeholder="What was discussed or sent?"
                    />
                    <Input
                      type="date"
                      value={nextDate}
                      onChange={(e) => setNextDate(e.target.value)}
                      placeholder="Next action date"
                    />
                    <Button onClick={handleLogFollowup} disabled={!nextDate} className="bg-teal-600 hover:bg-teal-700">
                      <CalendarClock className="mr-2 h-4 w-4" /> Schedule Follow-up
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900 mb-4">Follow-up health</h3>
                  <p className="text-xs text-muted-foreground mb-6">Cadence and query position</p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Total Follow-ups</p>
                      <p className="text-sm font-bold text-slate-900">{activities.filter(a => a.type.includes('followup')).length || 1}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Last Contact</p>
                      <p className="text-sm font-bold text-slate-900">{formatDate(activities[0]?.at) || "—"}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Current Stage</p>
                      <p className="text-sm font-bold text-slate-900">{status}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Advisor</p>
                      <p className="text-sm font-bold text-slate-900">{query.owner || "Unassigned"}</p>
                    </div>
                  </div>

                  <div className="mt-4 bg-teal-50 rounded-lg p-4">
                    <p className="text-[10px] font-bold text-teal-700 uppercase">Next control point</p>
                    <p className="font-bold text-slate-900 mt-1">Action not scheduled</p>
                    <p className="text-xs text-slate-500 mt-1">No closure reason recorded.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-slate-900 mb-4">Follow-up history</h3>
                <p className="text-xs text-muted-foreground mb-6">Every recorded contact date</p>
                <div className="flex gap-4">
                  <div className="h-8 w-8 bg-amber-50 rounded-full flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 border-b border-slate-100 pb-4">
                    <div className="flex justify-between">
                      <p className="font-semibold text-slate-900">Follow-up 1</p>
                      <p className="text-xs text-slate-500">{formatDate(activities[0]?.at) || "—"}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper icons for top header
function PlusIcon({ className }: { className?: string }) {
  return <span className={className}>+</span>;
}

function XIcon({ className }: { className?: string }) {
  return <span className={className}>×</span>;
}
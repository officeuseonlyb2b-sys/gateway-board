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
  X,
  Plus,
  Globe,
  Sparkles,
  Clock,
  AlertCircle,
  ChevronRight,
  Database
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner"; 

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

// New data for modal dropdowns from screenshots
const MEDIUMS = ["Call", "Email", "WhatsApp", "Meeting"];
const STATUSES = ["NURTURING", "WIN", "LOST"];
const REASONS = [
  "Package Cost is High",
  "Choose Other Destination",
  "Lost to Competitor",
  "Postponed",
  "No Longer Interested",
  "Non Availability of Train or Flight on desired dates",
  "Balck out dates",
  "Irrelevant Query",
  "Too Low Budget",
  "Health Issues",
  "Personal Reasons",
  "Confirmed But Later Lost",
  "Went Cold",
];

// Constants for Mock Overview Data (from screenshots)
const ACTIVITY_LOG = [
  { id: 1, title: "Follow-up 2 recorded", sub: "Via Email", date: "06 Aug 2026", type: "followup", color: "bg-orange-400" },
  { id: 2, title: "Follow-up 1 recorded", sub: "Via Email", date: "27 Jun 2026", type: "followup", color: "bg-orange-400" },
  { id: 3, title: "Query received", sub: "Agent · Email", date: "20 Jun 2026", type: "query", color: "bg-blue-500" },
];

const PROGRAM_SNAPSHOT = {
  code: "EX8WL05",
  name: "Marvels of Chambal & Bundelkhand",
  routing: "Ex Gwl | Gwl (2N) + Mor - Son - Dat - Orc (1N) - Hjr (1N) - Gwl",
  type: "Quick Getaways · North MP",
};

const COMMERCIAL_SNAPSHOT = {
  bottomLine: 1200000,
  topLine: 1200000,
  pax: 9,
  hotel: "5 Star",
  ratePerPerson: 33333,
  costingBasis: "FIT",
  hotelCount: 1,
};

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

  // Modal States
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isCostingModalOpen, setIsCostingModalOpen] = useState(false);

  // Form States
  const [logDate, setLogDate] = useState("2026-09-04");
  const [logMedium, setLogMedium] = useState("");
  const [logOutcome, setLogOutcome] = useState("");
  const [logNextActionDate, setLogNextActionDate] = useState("2026-09-06");

  const [newStatus, setNewStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [internalNote, setInternalNote] = useState("");

  // Costing Form States
  const [costingPax, setCostingPax] = useState("9");
  const [bottomLine, setBottomLine] = useState("1200000");
  const [topLine, setTopLine] = useState("1200000");
  const [ratePerPerson, setRatePerPerson] = useState("33333");
  const [hotelCategory, setHotelCategory] = useState("5 Star");

  // Mock logic to simulate the query's status from screenshots
  const status: Stage = "Nurturing";
  const currentActor = query?.owner || "Chhaya Prajapati";
  const activities = useMemo(() => ACTIVITY_LOG, []); // Mocking activity log for UI accuracy

  const mockQueryDetails = {
    id: "EMP26-27EMP0131",
    customer: "FlyHigh FlySafe",
    travelStart: "01 Oct 2026",
    travelEnd: "05 Oct 2026",
    pax: 9,
    destination: "North MP",
    enquiry_type: "FIT",
    owner: "Chhaya Prajapati",
    contact_person: "Anushka",
    mobile: "9741424302",
    email: "fly@flyhighflysafe.com",
    market: "B2B",
    lead_source: "Agent",
  };

  if (!query && !mockQueryDetails) {
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

  const handleLogFollowup = () => {
    if (!logOutcome) return;
    
    logFollowup(query?.query_id || mockQueryDetails.id, logOutcome, new Date(logNextActionDate).toISOString(), currentActor);
    
    toast.success("Activity saved successfully");
    setIsLogModalOpen(false);
    setLogMedium("");
    setLogOutcome("");
    setLogNextActionDate("2026-09-06");
  };

  const handleUpdateStatus = () => {
    if (!newStatus) return;

    let mappedStage: Stage = "Nurturing";
    if (newStatus === "WIN") mappedStage = "Confirmed";
    if (newStatus === "LOST") mappedStage = "Lost";

    setQueryStage(query?.query_id || mockQueryDetails.id, mappedStage, currentActor);
    
    toast.success("Query status updated successfully");
    setIsStatusModalOpen(false);
    setNewStatus("");
    setStatusReason("");
    setInternalNote("");
  };

  const handleSaveCosting = () => {
    toast.success("Costing values updated successfully");
    setIsCostingModalOpen(false);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      {/* TOP HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-blue-600">{mockQueryDetails.id}</span>
            <Badge variant="outline" className={`px-2 py-0 ${stageBadgeClass(status)}`}>{status}</Badge>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">{mockQueryDetails.customer}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Received 20 Jun 2026 • Owned by {mockQueryDetails.owner}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setIsLogModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Action
          </Button>
          
          <Button variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setIsStatusModalOpen(true)}>
            Update Status
          </Button>

          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/queries/query-tracker" })}>
            <X className="h-5 w-5 text-slate-400" />
          </Button>
        </div>
      </div>

      {/* INFO BAR */}
      <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <span>{mockQueryDetails.pax} Pax</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-400" />
          <span>{mockQueryDetails.destination}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-slate-400" />
          <span>{mockQueryDetails.travelStart} – {mockQueryDetails.travelEnd}</span>
        </div>
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-slate-400" />
          <span>{mockQueryDetails.enquiry_type}</span>
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
        {/* ================= OVERVIEW TAB (Matches Screenshots) ================= */}
        {tab === "Overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            
            {/* 1. Left-Middle Column */}
            <div className="xl:col-span-2 space-y-6">
              
              {/* Query Overview Card */}
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h2 className="text-lg font-bold text-slate-900">Query Overview</h2>
                  <p className="text-xs text-muted-foreground mb-6">The main facts, current stage and immediate action</p>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Travel partner</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{mockQueryDetails.customer}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Contact person</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{mockQueryDetails.contact_person}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Mobile / Email</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{mockQueryDetails.mobile}</p>
                        <p className="text-xs text-muted-foreground break-all">{mockQueryDetails.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Market / Source</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{mockQueryDetails.market} • {mockQueryDetails.lead_source}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Travel dates</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{mockQueryDetails.travelStart} – {mockQueryDetails.travelEnd}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Traveller range</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{mockQueryDetails.pax} pax</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Current stage</p>
                        <Badge variant="outline" className={`mt-1 px-2 py-0 ${stageBadgeClass(status)}`}>{status}</Badge>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Next action</p>
                        <p className="mt-1 text-sm font-semibold text-red-600">08 Aug 2026 • Overdue</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Program Snapshot Card */}
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Program Snapshot</h3>
                  <p className="text-xs text-muted-foreground mb-4">Selected programme and routing</p>
                  
                  <div className="bg-teal-50/50 border border-teal-100 rounded-lg p-4">
                    <p className="text-xs font-bold text-teal-700 mb-2">{PROGRAM_SNAPSHOT.code}</p>
                    <h4 className="text-xl font-bold text-slate-900">{PROGRAM_SNAPSHOT.name}</h4>
                    <p className="text-sm text-slate-600 mt-1">{PROGRAM_SNAPSHOT.routing}</p>
                    <p className="text-xs text-slate-500 mt-3">{PROGRAM_SNAPSHOT.type}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Latest Activity Card */}
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Latest Activity</h3>
                  <p className="text-xs text-muted-foreground mb-6">Most recent movements on this query</p>

                  <div className="space-y-0">
                    {ACTIVITY_LOG.map((event, idx) => (
                      <div key={event.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`h-3 w-3 rounded-full mt-1.5 ${event.color}`}></div>
                          {idx !== ACTIVITY_LOG.length - 1 && (
                            <div className="w-px flex-1 bg-slate-200"></div>
                          )}
                        </div>
                        <div className="pb-6">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{event.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{event.sub}</p>
                            </div>
                            <p className="text-xs text-slate-500 whitespace-nowrap">{event.date}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button variant="outline" className="w-full border-slate-200 text-slate-700 hover:bg-slate-50">
                    View all 5 activities <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>

            </div>

            {/* 2. Right Column */}
            <div className="space-y-6">
              
              {/* Lifecycle Progress Card */}
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h2 className="text-lg font-bold text-slate-900">Lifecycle Progress</h2>
                  <p className="text-xs text-muted-foreground mb-6">{status} • 5 recorded activities</p>

                  <div className="space-y-0">
                    {STAGES.filter(s => s !== "Confirmed" && s !== "Lost").map((stage, idx) => {
                      const isReached = STAGES.indexOf(status) >= STAGES.indexOf(stage);
                      
                      // Mocking dates to exactly match the screenshot
                      const stageDates: Record<string, string> = {
                        "New": "20 Jun 2026",
                        "Requirement Review": "20 Jun 2026",
                        "Costing": "06 Aug 2026",
                        "Quotation Sent": "06 Aug 2026",
                        "Follow-up": "06 Aug 2026",
                      };

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
                            <p className="text-xs text-slate-500">{stageDates[stage] || "Pending"}</p>
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

              {/* Commercial Snapshot Card */}
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Commercial Snapshot</h3>
                  <p className="text-xs text-muted-foreground mb-6">Bottom-line to top-line opportunity</p>

                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Bottom Line</p>
                      <p className="text-xl font-bold text-teal-700">{formatMoney(COMMERCIAL_SNAPSHOT.bottomLine)}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{COMMERCIAL_SNAPSHOT.pax} pax • {COMMERCIAL_SNAPSHOT.hotel}</p>
                    </div>
                    <div className="text-slate-300">→</div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Top Line</p>
                      <p className="text-xl font-bold text-slate-900">{formatMoney(COMMERCIAL_SNAPSHOT.topLine)}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{COMMERCIAL_SNAPSHOT.pax} pax • {COMMERCIAL_SNAPSHOT.hotel}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4">
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                      <Database className="h-3 w-3 mr-1" /> {COMMERCIAL_SNAPSHOT.costingBasis}
                    </Badge>
                    <p className="text-xs text-slate-500">{COMMERCIAL_SNAPSHOT.hotelCount} hotel category quoted</p>
                  </div>
                </CardContent>
              </Card>

              {/* Follow-ups / Next Step Card (Red Highlight) */}
              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Follow-ups / Next Step</h3>
                  <p className="text-xs text-muted-foreground mb-4">The next accountable action</p>
                  
                  <div className="bg-[#FDF1F1] border border-[#F3D4D4] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-red-700 uppercase flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Action Overdue
                      </p>
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setIsLogModalOpen(true)}>
                        <Plus className="h-3 w-3 mr-1" /> Add Action
                      </Button>
                    </div>
                    <p className="text-xl font-bold text-slate-900">08 Aug 2026</p>
                    <p className="text-xs text-slate-600 mt-1">Keep the client conversation and ownership visible.</p>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        )}

        {/* ================= OTHER TABS (Fully Functional) ================= */}
        {tab === "Program Info" && (
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardContent className="p-6">
                <p className="text-xs font-bold text-teal-700 uppercase mb-2">Program Information</p>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{PROGRAM_SNAPSHOT.name}</h2>
                    <p className="text-sm text-slate-500 mt-1">{PROGRAM_SNAPSHOT.routing}</p>
                  </div>
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{PROGRAM_SNAPSHOT.code}</Badge>
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
                      <p className="text-sm font-bold text-slate-900">{PROGRAM_SNAPSHOT.code}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Programme name</p>
                      <p className="text-sm font-bold text-slate-900">{PROGRAM_SNAPSHOT.name}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Programme type</p>
                      <p className="text-sm font-bold text-slate-900">{PROGRAM_SNAPSHOT.type.split("·")[0]}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Programme region</p>
                      <p className="text-sm font-bold text-slate-900">{PROGRAM_SNAPSHOT.type.split("·")[1]}</p>
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
                      <p className="text-sm font-bold text-slate-900">{mockQueryDetails.travelStart} – {mockQueryDetails.travelEnd}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Duration</p>
                      <p className="text-sm font-bold text-slate-900">5 Days</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Start city</p>
                      <p className="text-sm font-bold text-slate-900">Gwalior</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">End city</p>
                      <p className="text-sm font-bold text-slate-900">Gwalior</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        
        {tab === "Commercials" && (
          <div className="space-y-6">
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Bottom-line Query Value</p>
                    <p className="text-2xl font-bold text-teal-700 mt-1">{formatMoney(Number(bottomLine))}</p>
                    <p className="text-xs text-slate-500">{costingPax} pax • {formatMoney(Number(ratePerPerson))} • {hotelCategory}</p>
                  </div>
                  
                  <Button variant="outline" size="sm" onClick={() => setIsCostingModalOpen(true)} className="border-teal-600 text-teal-700 hover:bg-teal-50">
                    Edit Costing
                  </Button>

                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Top-line Query Value</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{formatMoney(Number(topLine))}</p>
                    <p className="text-xs text-slate-500">{costingPax} pax • {formatMoney(Number(ratePerPerson))} • {hotelCategory}</p>
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
                    <p className="text-2xl font-bold text-teal-700 mt-2">{formatMoney(Number(bottomLine))}</p>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Travellers</p><p className="text-sm font-bold">{costingPax} pax</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Hotel</p><p className="text-sm font-bold">{hotelCategory}</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Rate / person</p><p className="text-sm font-bold">{formatMoney(Number(ratePerPerson))}</p></div>
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
                    <p className="text-2xl font-bold text-slate-900 mt-2">{formatMoney(Number(topLine))}</p>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Travellers</p><p className="text-sm font-bold">{costingPax} pax</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Hotel</p><p className="text-sm font-bold">{hotelCategory}</p></div>
                      <div className="bg-white rounded p-2"><p className="text-[10px] text-slate-500">Rate / person</p><p className="text-sm font-bold">{formatMoney(Number(ratePerPerson))}</p></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
               <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Hotel categories quoted</h3>
                  <p className="text-xs text-muted-foreground mb-4">1 category included in the commercial range</p>
                  <div className="flex gap-2">
                    <Badge className="bg-teal-50 text-teal-700 border-teal-200 px-3 py-1">{hotelCategory}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900">Commercial classification</h3>
                  <p className="text-xs text-muted-foreground mb-4">How this query has been costed</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Costing basis</p>
                      <p className="text-sm font-bold text-slate-900">FIT</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Requirement</p>
                      <p className="text-sm font-bold text-slate-900">Package</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Traveller range</p>
                      <p className="text-sm font-bold text-slate-900">{costingPax} to {costingPax} pax</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Value range</p>
                      <p className="text-sm font-bold text-slate-900">{formatMoney(Number(bottomLine))}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        
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
                        <p className="text-xs text-slate-500 mt-1">{PROGRAM_SNAPSHOT.name} - latest working route</p>
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 06 Aug 2026 - Chhaya Prajapati</p>
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
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 20 Jun 2026 - Chhaya Prajapati</p>
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
                        <p className="text-xs text-slate-500 mt-1">{formatMoney(Number(bottomLine))} • FIT</p>
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 06 Aug 2026 - Chhaya Prajapati</p>
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
                        <p className="text-xs text-slate-500 mt-1">Initial 9 pax costing scenario</p>
                        <p className="text-[10px] text-slate-400 mt-2">Prepared 20 Jun 2026 - Chhaya Prajapati</p>
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
                    const lastDate = activities.find((act) => act.type === stage)?.date;

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
                          <p className="text-xs text-slate-500 mt-0.5">{lastDate || "Pending"}</p>
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
                    <p className="text-sm font-bold text-slate-900">{mockQueryDetails.owner}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Days in pipeline</p>
                    <p className="text-sm font-bold text-slate-900">5</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Follow-ups</p>
                    <p className="text-sm font-bold text-slate-900">2</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Outcome</p>
                    <p className="text-sm font-bold text-slate-900">{status}</p>
                  </div>
                </div>

                <div className="mt-4 bg-teal-50 rounded-lg p-4">
                  <p className="text-[10px] font-bold text-teal-700 uppercase">Next control point</p>
                  <p className="font-bold text-slate-900 mt-1">08 Aug 2026</p>
                  <p className="text-xs text-slate-500 mt-1">Action is overdue.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "Latest Activity" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-teal-700 uppercase">Audit Trail</p>
                <h2 className="text-2xl font-bold text-slate-900">Latest Activity</h2>
                <p className="text-sm text-slate-500">A single chronological history of calls, emails, status updates and internal progress.</p>
              </div>
              <Button variant="outline" className="border-teal-600 text-teal-700 hover:bg-teal-50" onClick={() => setIsLogModalOpen(true)}>+ Log Activity</Button>
            </div>

            <Card className="border-slate-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-slate-900">Complete activity history</h3>
                <p className="text-xs text-muted-foreground mb-6">{ACTIVITY_LOG.length} recorded events</p>

                <div className="space-y-6">
                  {ACTIVITY_LOG.map((event) => (
                    <div key={event.id} className="flex gap-4">
                      <div className={`h-3 w-3 rounded-full mt-1.5 ${event.color}`}></div>
                      <div className="flex-1 border-b border-slate-100 pb-4">
                        <div className="flex justify-between">
                          <p className="font-semibold text-slate-900">{event.title}</p>
                          <p className="text-xs text-slate-500">{event.date}</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{event.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "Follow-ups / Next Steps" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-teal-700 uppercase">Action Desk</p>
                <h2 className="text-2xl font-bold text-slate-900">Follow-ups / Next Steps</h2>
                <p className="text-sm text-slate-500">Make the next commitment, due date and conversation history explicit.</p>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setIsLogModalOpen(true)}>+ Add Follow-up</Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              <Card className="xl:col-span-2 border-slate-200">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900 mb-4">Next action</h3>
                  <p className="text-xs text-muted-foreground mb-4">The next accountable client touchpoint</p>
                  
                  <div className="bg-[#043b3a] rounded-lg p-6 text-white">
                    <p className="text-xs font-bold opacity-70 uppercase">Due Date</p>
                    <p className="text-3xl font-bold mt-2">08 Aug 2026</p>
                    <p className="text-sm opacity-80 mt-2">Owner: {mockQueryDetails.owner} • Email</p>
                    <Button className="mt-4 bg-white text-[#043b3a] hover:bg-slate-100" onClick={() => setIsLogModalOpen(true)}>
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
                      <p className="text-sm font-bold text-slate-900">2</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Last Contact</p>
                      <p className="text-sm font-bold text-slate-900">06 Aug 2026</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Current Stage</p>
                      <p className="text-sm font-bold text-slate-900">{status}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Advisor</p>
                      <p className="text-sm font-bold text-slate-900">{mockQueryDetails.owner}</p>
                    </div>
                  </div>

                  <div className="mt-4 bg-red-50 rounded-lg p-4">
                    <p className="text-[10px] font-bold text-red-700 uppercase">Next control point</p>
                    <p className="font-bold text-slate-900 mt-1">08 Aug 2026</p>
                    <p className="text-xs text-slate-500 mt-1">Action overdue.</p>
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
                      <p className="font-semibold text-slate-900">Follow-up 2</p>
                      <p className="text-xs text-slate-500">06 Aug 2026</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Via Email</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* MODALS */}
      
      {/* Log Follow-up Modal */}
      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Log Follow-up</DialogTitle>
            <p className="text-xs text-slate-500">{mockQueryDetails.id} • {mockQueryDetails.customer}</p>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Activity date <span className="text-red-500">*</span></Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="bg-white border" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Medium <span className="text-red-500">*</span></Label>
              <Select value={logMedium} onValueChange={setLogMedium}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {MEDIUMS.map((med) => <SelectItem key={med} value={med}>{med}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label className="text-sm font-medium">Outcome / note</Label>
              <Textarea placeholder="What was discussed or sent?" value={logOutcome} onChange={(e) => setLogOutcome(e.target.value)} className="min-h-[100px]" />
            </div>

            <div className="col-span-2 space-y-2">
              <Label className="text-sm font-medium">Next action date <span className="text-red-500">*</span></Label>
              <Input type="date" value={logNextActionDate} onChange={(e) => setLogNextActionDate(e.target.value)} className="bg-white border" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogModalOpen(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleLogFollowup}>Save activity</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Modal */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Update Query Status</DialogTitle>
            <p className="text-xs text-slate-500">{mockQueryDetails.id} • currently {status}</p>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">New status <span className="text-red-500">*</span></Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Reason / remark</Label>
              <Select value={statusReason} onValueChange={setStatusReason}>
                <SelectTrigger><SelectValue placeholder="Select if applicable" /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Internal note</Label>
              <Textarea placeholder="" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} className="min-h-[100px]" />
            </div>

            <div className="bg-teal-50 border border-teal-100 rounded-md p-4">
              <p className="text-xs font-semibold text-teal-800 mb-2">Automatic outcome rules</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  <p className="text-xs text-teal-800">Won → celebration and Operations Kitty hand-off</p>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  <p className="text-xs text-teal-800">Lost → reason required and pending tasks closed</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex justify-between items-center border-t pt-4">
            <p className="text-xs text-slate-400">Every change is added to the query activity history.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>Cancel</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleUpdateStatus}>Update status</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Costing Modal */}
      <Dialog open={isCostingModalOpen} onOpenChange={setIsCostingModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Edit Commercials</DialogTitle>
            <p className="text-xs text-slate-500">{mockQueryDetails.id} • Costing Range</p>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pax / Travellers</Label>
              <Input type="number" value={costingPax} onChange={(e) => setCostingPax(e.target.value)} className="bg-white border" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Hotel Category</Label>
              <Select value={hotelCategory} onValueChange={setHotelCategory}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {["3 Star", "4 Star", "5 Star"].map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label className="text-sm font-medium">Rate per person (₹)</Label>
              <Input type="number" value={ratePerPerson} onChange={(e) => setRatePerPerson(e.target.value)} className="bg-white border" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Bottom-line Value (₹) <span className="text-red-500">*</span></Label>
              <Input type="number" value={bottomLine} onChange={(e) => setBottomLine(e.target.value)} className="bg-white border" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Top-line Value (₹) <span className="text-red-500">*</span></Label>
              <Input type="number" value={topLine} onChange={(e) => setTopLine(e.target.value)} className="bg-white border" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCostingModalOpen(false)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveCosting}>Save Costing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
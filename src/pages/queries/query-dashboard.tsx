import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp,
  Wallet,
  Trophy,
  Percent,
  FileCheck2,
  AlarmClock,
  ArrowRight,
  Users,
  ListChecks,
  Briefcase,
  MapPin,
  Search,
  Calendar,
  RefreshCcw,
  Plus,
  ChevronDown,
  CircleCheck,
  CalendarDays,
  Grid3X3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCrmMetrics, isOpen } from "@/lib/crm/metrics";
import type { Stage } from "@/lib/crm/types";
import { inr, inrCompact } from "@/components/queries/qm-ui";

// STAGES ko define kiya
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

// ==========================================
// CUSTOM POPOVER COMPONENT FOR QUERY MONTH
// ==========================================
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function QueryMonthPopover({ selectedMonths, onSelect }: { selectedMonths: string[]; onSelect: (months: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleMonth = (month: string) => {
    if (selectedMonths.includes(month)) {
      onSelect(selectedMonths.filter((m) => m !== month));
    } else {
      onSelect([...selectedMonths, month]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent"
      >
        <span className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-muted-foreground" />
          {selectedMonths.length === 0 ? "All query months" : selectedMonths.join(", ")}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-lg border bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">Select query months</span>
            <button
              type="button"
              onClick={() => onSelect([])}
              className="text-xs font-medium text-teal-600 hover:text-teal-700"
            >
              All months
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {MONTHS.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => toggleMonth(month)}
                className={cn(
                  "rounded border px-2 py-1.5 text-xs font-medium transition",
                  selectedMonths.includes(month)
                    ? "border-teal-600 bg-teal-50 text-teal-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {month}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// CUSTOM POPOVER COMPONENT FOR RECEIVED DATE
// ==========================================
function ReceivedDatePopover({ onApply }: { onApply: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [selectedLabel, setSelectedLabel] = useState("All dates");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleApply = () => {
    if (selectedLabel.includes("Custom")) {
      onApply(`${fromDate || "Start"} to ${toDate || "End"}`);
    } else {
      onApply(selectedLabel);
    }
    setOpen(false);
  };

  const quickOptions = ["All dates", "Today", "This week", "Last 7 days", "This month"];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent"
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {selectedLabel}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-lg border bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">Received date / period</span>
            <button
              type="button"
              onClick={() => {
                setSelectedLabel("All dates");
                setFromDate("");
                setToDate("");
              }}
              className="text-xs font-medium text-teal-600 hover:text-teal-700"
            >
              Clear
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Filter using the query received date</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {quickOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  if (opt === "All dates") {
                    setSelectedLabel("All dates");
                    setFromDate("");
                    setToDate("");
                  } else {
                    setSelectedLabel(opt);
                  }
                }}
                className={cn(
                  "rounded border px-2.5 py-1.5 text-xs font-medium transition",
                  selectedLabel === opt
                    ? "border-teal-600 bg-teal-50 text-teal-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Specific date</p>
            <div className="relative">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="pr-8"
              />
              <CalendarDays className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Custom duration — From</p>
            <div className="relative">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="pr-8"
              />
              <CalendarDays className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">To</p>
            <div className="relative">
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="pr-8"
              />
              <CalendarDays className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleApply}
              className="rounded-md bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================
export default function QueryDashboard() {
  const m = useCrmMetrics();

  const total = m.totalQueries;
  const openQueries = m.queries.filter(isOpen);
  const confirmedQueries = m.queries.filter((q) => q.stage === "Confirmed");
  const lostQueries = m.queries.filter((q) => q.stage === "Lost");

  const confirmedValue = confirmedQueries.reduce((sum, q) => sum + (Number(q.value) || 0), 0);
  const openValue = openQueries.reduce((sum, q) => sum + (Number(q.value) || 0), 0);
  const totalValue = m.queries.reduce((sum, q) => sum + (Number(q.value) || 0), 0);

  const closedCount = confirmedQueries.length + lostQueries.length;
  const closedWinRate = closedCount > 0 ? (confirmedQueries.length / closedCount) * 100 : 0;
  const avgWonFile = confirmedQueries.length > 0 ? confirmedValue / confirmedQueries.length : 0;

  const overdueQueries = m.queries.filter(
    (q) => isOpen(q) && q.followup_due && new Date(q.followup_due).getTime() < Date.now()
  );
  const attentionPct = openQueries.length > 0 ? (overdueQueries.length / openQueries.length) * 100 : 0;

  const nurturingCount = m.queries.filter((q) => q.stage === "Nurturing" || q.stage === "Follow-up").length;
  const maxMonth = Math.max(1, ...m.trends.map((item) => item.leads));

  const stageStats = STAGES.map((stage) => {
    const stageQueries = m.queries.filter((q) => q.stage === stage);
    const value = stageQueries.reduce((sum, q) => sum + (Number(q.value) || 0), 0);
    return {
      status: stage,
      count: stageQueries.length,
      pct: total ? (stageQueries.length / total) * 100 : 0,
      value,
    };
  });

  const stageBarClass = (stage: Stage) => {
    switch (stage) {
      case "New": return "bg-sky-500";
      case "Requirement Review": return "bg-indigo-500";
      case "Costing": return "bg-amber-500";
      case "Quotation Sent": return "bg-blue-500";
      case "Follow-up": return "bg-violet-500";
      case "Nurturing": return "bg-orange-500";
      case "Confirmed": return "bg-emerald-500";
      case "Lost": return "bg-red-500";
      default: return "bg-primary";
    }
  };

  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [dateLabel, setDateLabel] = useState("All dates");

  const priorityQueries = m.queries
    .filter((q) => isOpen(q) && (q.priority === "High" || q.priority === "Urgent"))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">MP Tourism Operations Hub / Queries</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Query Performance Centre</h1>
          <p className="mt-1 text-sm text-muted-foreground">Decisions, commercial outcomes and team actions for the selected reporting period.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50">
            Open query tracker →
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white">
            <Plus className="mr-2 h-4 w-4" /> New Query
          </Button>
        </div>
      </div>

      {/* FILTER BAR WITH CUSTOM POPOVERS */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex items-center gap-3">
            <Badge className="bg-teal-50 text-teal-700 border-teal-200 rounded px-3 py-1.5">
              REPORTING CONTEXT
            </Badge>
            <span className="text-sm font-semibold text-slate-900">FY 2026-27</span>
            <span className="text-xs text-slate-500">{selectedMonths.length === 0 ? "All query months" : selectedMonths.join(", ")} • {dateLabel}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 lg:justify-end">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Financial Year</p>
              <Select defaultValue="FY 2026-27">
                <SelectTrigger className="h-9 text-xs border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FY 2026-27">FY 2026-27</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Query Month</p>
              <QueryMonthPopover selectedMonths={selectedMonths} onSelect={setSelectedMonths} />
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Received Date / Period</p>
              <ReceivedDatePopover onApply={setDateLabel} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EXACT KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Total enquiries */}
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-sm p-5 overflow-hidden">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-teal-100/60"></div>
          <p className="text-sm font-semibold text-slate-800">Total enquiries</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">334</p>
          <p className="text-xs text-slate-500 mt-2">240 B2B • 94 B2C</p>
        </div>

        {/* Card 2: Open opportunity range */}
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-sm p-5 overflow-hidden">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-yellow-100/70"></div>
          <p className="text-sm font-semibold text-slate-800">Open opportunity<br />range</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">₹1.36 Cr</p>
          <p className="text-xs text-slate-500 mt-2">101 nurturing<br />opportunities</p>
        </div>

        {/* Card 3: Confirmed business range */}
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-sm p-5 overflow-hidden">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-emerald-100/70"></div>
          <p className="text-sm font-semibold text-slate-800">Confirmed business<br />range</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">₹72.8 L</p>
          <p className="text-xs text-slate-500 mt-2">41 queries converted</p>
        </div>

        {/* Card 4: Query-to-win rate */}
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-sm p-5 overflow-hidden">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-blue-100/60"></div>
          <p className="text-sm font-semibold text-slate-800">Query-to-win rate</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">12.3%</p>
          <p className="text-xs text-slate-500 mt-2">17.7% of closed outcomes<br />won</p>
        </div>

        {/* Card 5: Average won file */}
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-sm p-5 overflow-hidden">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-purple-100/60"></div>
          <p className="text-sm font-semibold text-slate-800">Average won file</p>
          <p className="text-3xl font-bold text-slate-900 mt-3">₹1.8 L</p>
          <p className="text-xs text-slate-500 mt-2">Bottom-line to top-line<br />average</p>
        </div>

        {/* Card 6: Overdue follow-ups */}
        <div className="relative rounded-2xl bg-[#043b3a] border border-[#043b3a] shadow-sm p-5 overflow-hidden">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-pink-200/30"></div>
          <p className="text-sm font-semibold text-slate-200">Overdue follow-ups</p>
          <p className="text-3xl font-bold text-red-400 mt-3">{overdueQueries.length}</p>
          <p className="text-xs text-teal-200 mt-2">14 active<br />schedule</p>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* PIPELINE & TRAJECTORY */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Pipeline health & trajectory</h2>
                <p className="text-xs text-slate-500 mt-0.5">Outcome mix and month-by-month movement</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Select defaultValue="all">
                  <SelectTrigger className="h-8 w-[110px] border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All dates</SelectItem></SelectContent>
                </Select>
                <Select defaultValue="all">
                  <SelectTrigger className="h-8 w-[140px] border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All query months</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-slate-500">Total queries</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">334</p>
                <p className="text-[10px] text-slate-500 mt-1">Queries • ₹4.43 Cr potential value</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Open query count</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">17.7%</p>
                <p className="text-[10px] text-slate-500 mt-1">Closed win rate</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total pipeline value</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">17.7%</p>
                <p className="text-[10px] text-slate-500 mt-1">In pipeline</p>
              </div>
            </div>

            {/* Pipeline Bar */}
            <div className="mt-6">
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
                {stageStats.filter(s => s.count > 0).map((stage) => (
                  <div
                    key={stage.status}
                    className={cn("h-full border-r-2 border-white", stageBarClass(stage.status))}
                    style={{ width: `${stage.pct}%` }}
                    title={`${stage.status}: ${stage.count}`}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <StageTile label="Nurturing" count={nurturingCount} pct={stageStats.find(s => s.status === "Nurturing")?.pct || 0} value={stageStats.find(s => s.status === "Nurturing")?.value || 0} />
                <StageTile label="Won" count={confirmedQueries.length} pct={stageStats.find(s => s.status === "Confirmed")?.pct || 0} value={confirmedValue} />
                <StageTile label="Lost" count={lostQueries.length} pct={stageStats.find(s => s.status === "Lost")?.pct || 0} value={stageStats.find(s => s.status === "Lost")?.value || 0} />
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Monthly trajectory</h3>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 bg-orange-500 rounded-full"></span> Nurturing</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 bg-emerald-500 rounded-full"></span> Won</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 bg-red-500 rounded-full"></span> Lost</span>
                </div>
              </div>
              <div className="flex h-32 items-end gap-2">
                {m.trends.map((row) => (
                  <div key={row.key} className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex w-full h-full items-end justify-center gap-1">
                      <div className="w-3 bg-orange-400" style={{ height: `${(row.leads / maxMonth) * 60}%` }} />
                      <div className="w-3 bg-emerald-500" style={{ height: `${(row.won / maxMonth) * 40}%` }} />
                      <div className="w-3 bg-red-300" style={{ height: `${(row.lost / maxMonth) * 30}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500">{row.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* IMMEDIATE ACTION SIDEBAR */}
        <Card className="bg-[#043b3a] border-0 text-white shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-teal-300 text-xs font-semibold uppercase tracking-wider">
              <TrendingUp className="h-4 w-4" /> Immediate Action
            </div>
            <h2 className="text-xl font-bold mt-2">Follow-up controls</h2>
            <p className="text-xs text-teal-200 mt-1">87% of active nurturing queries require attention.</p>

            <div className="mt-6 bg-teal-800/50 border border-teal-600/50 rounded-lg p-4">
              <p className="text-3xl font-bold">{overdueQueries.length}</p>
              <p className="text-xs text-teal-200 mt-1">overdue follow-ups</p>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-teal-200">All open queries</span>
              <span className="font-bold">{openQueries.length}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-teal-200">Nurturing / Follow-up</span>
              <span className="font-bold">{nurturingCount}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-teal-200">Pending quotations</span>
              <span className="font-bold">{m.pendingQuotations}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-teal-200">Quotes sent today</span>
              <span className="font-bold">{m.quotesSentToday}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-teal-200">Follow-ups due today</span>
              <span className="font-bold">{m.followupsDueToday}</span>
            </div>

            <Button asChild className="mt-8 w-full bg-teal-500 hover:bg-teal-400 text-[#043b3a] font-bold border-0">
              <Link to="/queries/follow-up-desk">
                Open action desk <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* STATUS COMPARISON TABLE */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Status comparison</h2>
              <p className="text-xs text-slate-500 mt-0.5">Count, share and value by CRM status</p>
            </div>
            <Badge variant="outline" className="text-slate-600">All dates</Badge>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-emerald-500" /> Nurturing
              <span className="font-bold text-slate-900">101</span>
              <span className="text-[10px]">30.1% of queries</span>
              <span className="text-[10px] text-slate-400">₹1.36 Cr</span>
            </div>
            <div className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-emerald-500" /> Won
              <span className="font-bold text-slate-900">41</span>
              <span className="text-[10px]">12.2% of queries</span>
              <span className="text-[10px] text-slate-400">₹72.8 L</span>
            </div>
            <div className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-red-500" /> Lost
              <span className="font-bold text-slate-900">190</span>
              <span className="text-[10px]">57.0% of queries</span>
              <span className="text-[10px] text-slate-400">₹1.50 Cr</span>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Query / Stage</th>
                  <th className="px-3 py-2 text-right font-semibold">Assigned</th>
                  <th className="px-3 py-2 text-right font-semibold">Active</th>
                  <th className="px-3 py-2 text-right font-semibold">Won</th>
                  <th className="px-3 py-2 text-right font-semibold">Win rate</th>
                  <th className="px-3 py-2 text-right font-semibold">Active value range</th>
                </tr>
              </thead>
              <tbody>
                {m.workload.map((row) => (
                  <tr key={row.employee.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-bold">
                          {row.employee.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{row.employee.name}</p>
                          <p className="text-[10px] text-slate-500">{row.employee.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.assigned}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.assigned}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.conversion}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.conversion.toFixed(1)}%</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{inrCompact(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* PRIORITY OPPORTUNITIES */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Priority opportunities</h2>
              <p className="text-xs text-slate-500 mt-0.5">High-value nurturing queries in the overall selected period</p>
            </div>
            <Button variant="ghost" className="text-teal-700 text-xs">
              View nurturing pipeline <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Query / Partner</th>
                  <th className="px-3 py-2 font-semibold">Travel plan</th>
                  <th className="px-3 py-2 font-semibold">Costing basis</th>
                  <th className="px-3 py-2 font-semibold">Advisor</th>
                  <th className="px-3 py-2 text-right font-semibold">Opportunity range</th>
                  <th className="px-3 py-2 text-right font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody>
                {priorityQueries.map((q) => (
                  <tr key={q.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-800">{q.customer || "Direct Query"}</p>
                      <p className="text-[10px] text-blue-600">{q.query_id}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-xs text-slate-700">{q.destination || "Destination not set"}</p>
                      <p className="text-[10px] text-slate-500">{q.travel_start ? new Date(q.travel_start).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} – {q.travel_end ? new Date(q.travel_end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">{q.enquiry_type || "FIT"}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 text-xs text-slate-700">
                        <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                          {q.owner?.charAt(0) || "U"}
                        </div>
                        {q.owner || "Unassigned"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="font-semibold text-slate-900">{inr(q.value)}</p>
                      <p className="text-[10px] text-slate-500">{inr(q.value)}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-xs">
                      <span className="text-red-600 font-medium">09 Aug</span>
                      <p className="text-[10px] text-slate-500">Overdue</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper components
function InboxIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  );
}

function StageTile({ label, count, pct, value }: { label: string; count: number; pct: number; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-1">{count}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{pct.toFixed(1)}% of queries</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold text-slate-700">{inrCompact(value)}</p>
        <p className="text-[10px] text-slate-400 mt-1">Value</p>
      </div>
    </div>
  );
}
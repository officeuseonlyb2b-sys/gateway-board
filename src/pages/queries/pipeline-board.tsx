import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  RefreshCcw,
  Search,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCrmMetrics, isOpen } from "@/lib/crm/metrics";
import { setQueryStage } from "@/lib/crm/store";
import type { CrmQuery, Stage } from "@/lib/crm/types";

// Exact Stage Colors for Board Headers and Pills
const STAGE_COLORS: Record<Stage, { header: string; dot: string; badge: string; pill: string }> = {
  "New": { header: "bg-sky-50 border-sky-200", dot: "bg-sky-500", badge: "bg-sky-100 text-sky-700", pill: "bg-sky-50 text-sky-700 border-sky-200" },
  "Requirement Review": { header: "bg-indigo-50 border-indigo-200", dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-700", pill: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "Costing": { header: "bg-amber-50 border-amber-200", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700", pill: "bg-amber-50 text-amber-700 border-amber-200" },
  "Quotation Sent": { header: "bg-blue-50 border-blue-200", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700", pill: "bg-blue-50 text-blue-700 border-blue-200" },
  "Follow-up": { header: "bg-violet-50 border-violet-200", dot: "bg-violet-500", badge: "bg-violet-100 text-violet-700", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  "Nurturing": { header: "bg-orange-50 border-orange-200", dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700", pill: "bg-orange-50 text-orange-700 border-orange-200" },
  "Confirmed": { header: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "Lost": { header: "bg-red-50 border-red-200", dot: "bg-red-500", badge: "bg-red-100 text-red-700", pill: "bg-red-50 text-red-700 border-red-200" },
};

// Only Open Stages for the Board
const OPEN_STAGES: Stage[] = ["New", "Requirement Review", "Costing", "Quotation Sent", "Follow-up", "Nurturing"];

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
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function QueryCard({ query, onOpen, onMove }: { query: CrmQuery; onOpen: () => void; onMove: (stage: Stage) => void }) {
  const colors = STAGE_COLORS[query.stage];
  const isOverdue = isOpen(query) && !!query.followup_due && new Date(query.followup_due).getTime() < Date.now();

  return (
    <Card 
      className="rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition-all cursor-pointer"
      onClick={onOpen}
    >
      <CardContent className="p-4 space-y-2">
        {/* Top Row: ID + Status Badge */}
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-blue-600">{query.query_id}</div>
          {isOverdue ? (
            <Badge className="bg-red-100 text-red-700 border-0 font-medium px-1.5 py-0">Overdue</Badge>
          ) : (
            <Badge className={`${colors.pill} border font-medium px-1.5 py-0`}>{query.stage}</Badge>
          )}
        </div>

        {/* Customer Name */}
        <h3 className="text-sm font-semibold text-slate-900 leading-tight">
          {query.customer || "Direct Query"}
        </h3>

        {/* Destination */}
        <p className="text-xs text-slate-600 truncate">{query.destination || "Destination not set"}</p>

        {/* Date Range */}
        <p className="text-xs text-slate-500">
          {formatDate(query.travel_start)} → {formatDate(query.travel_end)}
        </p>

        {/* Divider + Owner + Value */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{query.owner || "Unassigned"}</span>
          </div>
          <div className="text-xs font-bold text-slate-900">{formatMoney(query.value)}</div>
        </div>

        {/* Tags / Pills */}
        <div className="flex flex-wrap gap-1.5">
          {query.lead_source && (
            <Badge variant="outline" className={`${colors.pill} border font-medium px-1.5 py-0`}>{query.lead_source}</Badge>
          )}
          {query.enquiry_type && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium px-1.5 py-0">{query.enquiry_type}</Badge>
          )}
          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-medium px-1.5 py-0">{query.pax || 0} Pax</Badge>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
          <Select value={query.stage} onValueChange={(val) => onMove(val as Stage)}>
            <SelectTrigger className="h-7 w-[110px] text-xs border-slate-200 focus:ring-0 focus:ring-offset-0 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPEN_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>{stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2" onClick={onOpen}>
            Open
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PipelineBoard() {
  const navigate = useNavigate();
  const m = useCrmMetrics();

  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const [source, setSource] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [travelMonth, setTravelMonth] = useState("all");
  const [duePeriod, setDuePeriod] = useState("all");

  const resetFilters = () => {
    setSearch(""); setOwner("all"); setSource("all"); setCustomer("all"); setTravelMonth("all"); setDuePeriod("all");
  };

  const owners = useMemo(() => m.employees.filter(e => e.active !== false).map(e => e.name).sort(), [m.employees]);
  const sources = useMemo(() => [...new Set(m.queries.map(q => q.lead_source).filter(Boolean))].sort(), [m.queries]);
  const customers = useMemo(() => [...new Set(m.queries.map(q => q.customer).filter(Boolean))].sort(), [m.queries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return m.queries.filter((q) => {
      const matchesSearch = !term || [q.query_id, q.customer, q.contact_person, q.destination, q.owner].filter(Boolean).some(v => String(v).toLowerCase().includes(term));
      const matchesOwner = owner === "all" || q.owner === owner;
      const matchesSource = source === "all" || q.lead_source === source;
      const matchesCustomer = customer === "all" || q.customer === customer;
      return matchesSearch && matchesOwner && matchesSource && matchesCustomer;
    });
  }, [m.queries, search, owner, source, customer]);

  const stageRows = useMemo(() => {
    return Object.fromEntries(OPEN_STAGES.map(stage => [
      stage,
      filtered.filter(q => q.stage === stage).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    ])) as Record<string, CrmQuery[]>;
  }, [filtered]);

  const totalValue = filtered.reduce((sum, q) => sum + (Number(q.value) || 0), 0);

  const moveStage = (queryId: string, nextStage: Stage) => {
    const query = m.queries.find(q => q.query_id === queryId);
    if (!query || query.stage === nextStage) return;
    setQueryStage(query.query_id, nextStage, query.owner || "System");
  };

  const openQuery = (query: CrmQuery) => navigate({ to: "/queries/$id", params: { id: query.id } });

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">MP Tourism Operations Hub / Queries</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Pipeline Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the complete query journey by reporting period, partner, executive and query profile</p>
        </div>
        <Button variant="outline" className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 h-8">
          View stage rules
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-800 border-0 font-normal rounded">PIPELINE SCOPE</Badge>
              <span className="text-sm font-semibold text-slate-900">{filtered.length} of {m.queries.length} queries</span>
              <span className="text-xs text-muted-foreground">All pipeline records</span>
            </div>
            <Button variant="outline" size="sm" onClick={resetFilters} className="text-slate-600 h-7">
              <RefreshCcw className="mr-2 h-3 w-3" /> Reset all filters
            </Button>
          </div>

          {/* Grid 1 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Financial Year</p>
              <Select defaultValue="FY 2026-27">
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="FY 2026-27">FY 2026-27</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Received Month(s)</p>
              <Select defaultValue="all">
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All query months</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Received Date / Period</p>
              <Select defaultValue="all">
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All dates</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Due Period</p>
              <Select value={duePeriod} onValueChange={setDuePeriod}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All due periods</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Executive</p>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All executives</SelectItem>
                  {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Grid 2 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 lg:col-span-1">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Query / Agent / Contact</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search query no., partner or contact" className="h-8 text-xs pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Travel Agent / Partner</p>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents / partners</SelectItem>
                  {customers.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Query Type</p>
              <Select defaultValue="all">
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All query types</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Costing Basis</p>
              <Select defaultValue="all">
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All costing bases</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Travel Month</p>
              <Select defaultValue="all">
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All travel months</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stage Counts (Clean aligned cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {OPEN_STAGES.map((stage) => (
          <div key={stage} className={`rounded-lg border p-4 ${STAGE_COLORS[stage].header}`}>
            <p className="text-xs font-bold text-slate-700">{stage}</p>
            <div className="flex items-baseline justify-between mt-2">
              <p className="text-3xl font-bold text-slate-900">{stageRows[stage].length}</p>
              {stage === "Nurturing" && <Badge className="bg-orange-100 text-orange-700 border-0">101</Badge>}
            </div>
            <p className="text-[10px] text-slate-500 mt-1 truncate">
              {stage === "New" && "Query awaiting assignment"}
              {stage === "Requirement Review" && "Query awaiting or processed"}
              {stage === "Costing" && "Costing, quotation or approval"}
              {stage === "Quotation Sent" && "Proposal sent or response"}
              {stage === "Follow-up" && "Follow-up scheduled"}
              {stage === "Nurturing" && "Nurturing, awaiting or confirming"}
            </p>
          </div>
        ))}
      </div>

      {/* Pipeline Total Value */}
      <div className="flex items-center justify-end">
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-900">₹{formatMoney(totalValue)}</span> opportunity range.
        </p>
      </div>

      {/* Kanban Board - Exact 6 Column Alignment */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
        {OPEN_STAGES.map((stage) => {
          const colors = STAGE_COLORS[stage];
          const rows = stageRows[stage];

          return (
            <div key={stage} className="min-w-0 space-y-3">
              {/* Column Header */}
              <div className={`rounded-lg border p-2.5 flex items-center justify-between ${colors.header}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${colors.dot}`}></span>
                  <span className="text-xs font-bold text-slate-800">{stage}</span>
                </div>
                <span className="text-xs font-bold text-slate-500">{rows.length}</span>
              </div>
              
              {/* Cards Stack */}
              <div className="space-y-3">
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground bg-slate-50/50">
                    No matching queries in {stage}
                  </div>
                ) : (
                  rows.slice(0, 15).map((query) => (
                    <QueryCard key={query.id} query={query} onOpen={() => openQuery(query)} onMove={(val) => moveStage(query.query_id, val)} />
                  ))
                )}
                {rows.length > 15 && (
                  <div className="text-center text-[11px] font-medium text-slate-500 py-1 bg-slate-50 rounded">
                    Showing latest 15 of {rows.length}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
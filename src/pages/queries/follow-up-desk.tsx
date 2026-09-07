import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  Search,
  AlertTriangle,
  Users,
  Filter,
  RotateCcw,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { isOpen, sameDay, useCrmMetrics } from "@/lib/crm/metrics";
import type { CrmQuery } from "@/lib/crm/types";

const DAY = 24 * 60 * 60 * 1000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMoney(value: number) {
  const amount = Number(value) || 0;
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)} L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)} K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatShortDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dueLabel(query: CrmQuery) {
  if (!query.followup_due) return { label: "No follow-up", tone: "default" as const };
  const due = new Date(query.followup_due);
  const now = new Date();
  if (due.getTime() < now.getTime()) return { label: "Overdue", tone: "danger" as const };
  if (sameDay(query.followup_due, startOfToday())) return { label: "Due Today", tone: "warning" as const };
  const diff = Math.ceil((due.getTime() - now.getTime()) / DAY);
  if (diff <= 7) return { label: `${diff}d`, tone: "warning" as const };
  return { label: `${diff}d`, tone: "default" as const };
}

export default function FollowUpDesk() {
  const navigate = useNavigate();
  const m = useCrmMetrics();

  const today = startOfToday();
  
  // Filters State
  const [search, setSearch] = useState("");
  const [financialYear, setFinancialYear] = useState("FY 2026-27");
  const [receivedMonth, setReceivedMonth] = useState("all");
  const [receivedDate, setReceivedDate] = useState("all");
  const [duePeriod, setDuePeriod] = useState("all");
  const [executive, setExecutive] = useState("all");
  const [travelAgent, setTravelAgent] = useState("all");
  const [queryType, setQueryType] = useState("all");
  const [costingBasis, setCostingBasis] = useState("all");
  const [travelMonth, setTravelMonth] = useState("all");
  const [priorityScenario, setPriorityScenario] = useState("All scenarios");
  const [sortPriority, setSortPriority] = useState("Smart priority (recommended)");

  // Data
  const activeQueries = useMemo(() => m.queries.filter(isOpen), [m.queries]);

  const allFollowups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeQueries.filter((q) => {
      const matchesSearch = !term || [q.query_id, q.customer, q.contact_person, q.destination, q.owner]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
      
      const matchesExecutive = executive === "all" || q.owner === executive;
      const matchesAgent = travelAgent === "all" || true; // Add logic if needed

      return matchesSearch && matchesExecutive && matchesAgent;
    });
  }, [activeQueries, search, executive, travelAgent]);

  // Stats
  const overdueCount = allFollowups.filter(q => q.followup_due && new Date(q.followup_due).getTime() < Date.now()).length;
  const dueTodayCount = allFollowups.filter(q => q.followup_due && sameDay(q.followup_due, today)).length;
  const upcomingCount = allFollowups.filter(q => q.followup_due && new Date(q.followup_due) > new Date() && new Date(q.followup_due) < new Date(Date.now() + 7 * DAY)).length;
  const highValueCount = allFollowups.filter(q => Number(q.value) >= 100_000).length;

  const openQuery = (query: CrmQuery) => navigate({ to: "/queries/$id", params: { id: query.id } });

  const resetFilters = () => {
    setSearch(""); setExecutive("all"); setTravelAgent("all"); setQueryType("all"); setCostingBasis("all"); setTravelMonth("all");
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            MP Tourism Operations Hub / Queries
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Follow-up Control Desk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Executive-wise action planning, smart priority checks and complete follow-up visibility.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-slate-600 font-normal">FY 2026-27</Badge>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white">
            + New Query
          </Button>
        </div>
      </div>

      {/* FILTER SECTION */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="p-5 space-y-5">
          {/* Top Row */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Action Scope</span>
              <span className="text-lg font-bold text-slate-900">{allFollowups.length} priority queries</span>
              <span className="text-xs text-muted-foreground">Smart priority across all nurturing queries</span>
            </div>
            <Button variant="outline" size="sm" onClick={resetFilters} className="text-slate-600">
              <RotateCcw className="mr-2 h-3 w-3" />
              Reset all filters
            </Button>
          </div>

          {/* Grid 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">FINANCIAL YEAR</Label>
              <Select value={financialYear} onValueChange={setFinancialYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FY 2026-27">FY 2026-27</SelectItem>
                  <SelectItem value="FY 2025-26">FY 2025-26</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">RECEIVED MONTH(S)</Label>
              <Select value={receivedMonth} onValueChange={setReceivedMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All query months</SelectItem>
                  <SelectItem value="jan">January</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">RECEIVED DATE / PERIOD</Label>
              <Select value={receivedDate} onValueChange={setReceivedDate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">DUE PERIOD</Label>
              <Select value={duePeriod} onValueChange={setDuePeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All due periods</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">EXACT DUE DAY</Label>
              <div className="relative">
                <Input type="date" className="pr-8" />
                <CalendarClock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Grid 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2 lg:col-span-1">
              <Label className="text-xs text-slate-500">EMP EXECUTIVE</Label>
              <Select value={executive} onValueChange={setExecutive}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All executives</SelectItem>
                  {m.employees.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">QUERY / AGENT / CONTACT</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search query no., partner or contact" className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">TRAVEL AGENT / PARTNER</Label>
              <Select value={travelAgent} onValueChange={setTravelAgent}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents / partners</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">QUERY TYPE</Label>
              <Select value={queryType} onValueChange={setQueryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All query types</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">COSTING BASIS</Label>
              <Select value={costingBasis} onValueChange={setCostingBasis}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All costing bases</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Grid 3 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2 lg:col-span-1">
              <Label className="text-xs text-slate-500">TRAVEL MONTH</Label>
              <Select value={travelMonth} onValueChange={setTravelMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All travel months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-1">
              <Label className="text-xs text-slate-500">PRIORITY SCENARIO</Label>
              <Select value={priorityScenario} onValueChange={setPriorityScenario}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All scenarios">All scenarios</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-3">
              <Label className="text-xs text-slate-500">SORT PRIORITY BY</Label>
              <div className="rounded-lg border bg-slate-50 p-3 flex items-center gap-3">
                <Select value={sortPriority} onValueChange={setSortPriority}>
                  <SelectTrigger className="flex-1 border-0 bg-transparent shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Smart priority (recommended)">Smart priority (recommended)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-blue-600 font-medium shrink-0 bg-blue-50 px-2 py-1 rounded">SMART PRIORITY</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* STATS CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl bg-orange-50 border-orange-100 overflow-hidden relative">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">Filtered nurturing</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{allFollowups.length}</p>
            <p className="text-xs text-slate-500 mt-1">Queries matching the current scope</p>
          </CardContent>
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-orange-200/50"></div>
        </Card>

        <Card className="rounded-xl bg-red-50 border-red-100 overflow-hidden relative">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">Overdue</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{overdueCount}</p>
            <p className="text-xs text-slate-500 mt-1">Next action date has passed</p>
          </CardContent>
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-red-200/50"></div>
        </Card>

        <Card className="rounded-xl bg-yellow-50 border-yellow-100 overflow-hidden relative">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">Due today</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{dueTodayCount}</p>
            <p className="text-xs text-slate-500 mt-1">Scheduled for today</p>
          </CardContent>
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-yellow-200/50"></div>
        </Card>

        <Card className="rounded-xl bg-blue-50 border-blue-100 overflow-hidden relative">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">Next 7 days</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{upcomingCount}</p>
            <p className="text-xs text-slate-500 mt-1">Upcoming planned actions</p>
          </CardContent>
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-blue-200/50"></div>
        </Card>
      </div>

      {/* SOD TABLE */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800">All-Advisor SOD Follow-up Overview</h2>
              <p className="text-xs text-muted-foreground">Daily, weekly and monthly commitments for the morning review call</p>
            </div>
            <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 bg-blue-50">
              SOD DISCUSSION VIEW
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="p-3 font-semibold">EMP Executive</th>
                  <th className="p-3 text-right font-semibold">Open</th>
                  <th className="p-3 text-right font-semibold">Overdue</th>
                  <th className="p-3 text-right font-semibold">Due today</th>
                  <th className="p-3 text-right font-semibold">This week</th>
                  <th className="p-3 text-right font-semibold">This month</th>
                  <th className="p-3 text-right font-semibold">High value</th>
                  <th className="p-3 text-right font-semibold">Top-line opportunity</th>
                </tr>
              </thead>
              <tbody>
                {m.workload.map((row) => {
                  const mine = activeQueries.filter(q => q.owner === row.employee.name);
                  return (
                    <tr key={row.employee.id} className="border-b last:border-0">
                      <td className="p-3 font-medium text-slate-800">{row.employee.name}</td>
                      <td className="p-3 text-right text-slate-600">{mine.length}</td>
                      <td className={`p-3 text-right ${row.overdue > 0 ? "font-semibold text-red-600" : "text-slate-600"}`}>{row.overdue}</td>
                      <td className="p-3 text-right text-slate-600">{mine.filter(q => q.followup_due && sameDay(q.followup_due, today)).length}</td>
                      <td className="p-3 text-right text-slate-600">{mine.filter(q => q.followup_due && new Date(q.followup_due) > new Date() && new Date(q.followup_due) < new Date(Date.now() + 7 * DAY)).length}</td>
                      <td className="p-3 text-right text-slate-600">{mine.filter(q => q.followup_due && new Date(q.followup_due) > new Date() && new Date(q.followup_due) < new Date(Date.now() + 30 * DAY)).length}</td>
                      <td className="p-3 text-right text-slate-600">{mine.filter(q => Number(q.value) >= 100_000).length}</td>
                      <td className="p-3 text-right font-semibold text-emerald-600">{formatMoney(mine.reduce((sum, q) => sum + (Number(q.value) || 0), 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MAIN LIST (PRIORITY QUEUE) */}
      <div className="space-y-4">
        <h2 className="font-semibold text-slate-800">Priority Queue</h2>
        <div className="grid grid-cols-1 gap-4">
          {allFollowups.slice(0, 10).map((query, index) => {
            const due = dueLabel(query);
            return (
              <div key={query.id} className="flex flex-col md:flex-row gap-4 p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 md:w-16 justify-center">
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-bold text-slate-700">{100 - index * 5}</span>
                    <div className="w-8 h-1 bg-slate-200 rounded-full mt-1"></div>
                  </div>
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-teal-600">{query.query_id}</span>
                    {due.tone === "danger" && <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">Overdue</Badge>}
                    {due.tone === "warning" && <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">{due.label}</Badge>}
                    {due.tone === "default" && <Badge variant="outline">Open</Badge>}
                  </div>
                  <h3 className="font-semibold text-slate-900">{query.customer || "Direct Query"}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {query.destination || "Destination not set"} • {query.pax || 0} Pax • Next: {query.next_action || "Requirement Review"} 
                  </p>
                </div>

                <div className="flex md:flex-col justify-between md:items-end gap-2">
                  <div className="text-right">
                    <div className="font-semibold text-slate-800">{formatMoney(query.value)}</div>
                    <div className="text-xs text-muted-foreground">{query.followup_due ? formatShortDate(query.followup_due) : "No date set"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-slate-600">+ Log</Button>
                    <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => openQuery(query)}>Open</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
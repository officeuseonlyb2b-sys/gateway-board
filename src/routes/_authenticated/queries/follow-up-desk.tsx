// src/routes/_authenticated/queries/follow-up-desk.tsx

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Filter,
  RefreshCcw,
  Search,
  AlertTriangle,
  Users,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

import { isOpen, sameDay, useCrmMetrics } from "@/lib/crm/metrics";
import { completeFollowup, scheduleFollowup, logFollowup } from "@/lib/crm/store";
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

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [priority, setPriority] = useState("all");
  const [market, setMarket] = useState("all");
  const [service, setService] = useState("all");

  const [logQuery, setLogQuery] = useState<CrmQuery | null>(null);
  const [updateQuery, setUpdateQuery] = useState<CrmQuery | null>(null);

  const today = startOfToday();
  const activeQueries = useMemo(() => m.queries.filter(isOpen), [m.queries]);

  const allFollowups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeQueries.filter((q) => {
      const matchesSearch = !term || [q.query_id, q.customer, q.contact_person, q.destination, q.owner]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
      const matchesOwner = owner === "all" || q.owner === owner;
      return matchesSearch && matchesOwner;
    }).sort((a, b) => {
      const aTime = a.followup_due ? new Date(a.followup_due).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.followup_due ? new Date(b.followup_due).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [activeQueries, search, owner, priority]);

  const openQuery = (query: CrmQuery) => navigate({ to: "/queries/$id", params: { id: query.id } });
  
  const handleOpenLogModal = (query: CrmQuery) => setLogQuery(query);
  const handleOpenUpdateModal = (query: CrmQuery) => setUpdateQuery(query);

  const reset = () => {
    setSearch(""); setOwner("all"); setStatus("all"); setPriority("all");
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Query Management</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Follow-up Desk</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sorted by smart priority, every ongoing signal is visible.</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700 text-white">
          + New Query
        </Button>
      </div>

      {/* FILTER BAR */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-6">
            <div className="relative col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search query, customer..." className="pl-9" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="today">Due Today</SelectItem>
                <SelectItem value="7days">Next 7 Days</SelectItem>
                <SelectItem value="none">No Follow-up</SelectItem>
              </SelectContent>
            </Select>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue placeholder="All owners" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {m.employees.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue placeholder="All priorities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger><SelectValue placeholder="All services" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                <SelectItem value="b2c">B2C</SelectItem>
                <SelectItem value="b2b">B2B</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* DASHBOARD STATS */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-emerald-50 border-emerald-100"><CardContent className="pt-5">
          <p className="text-4xl font-bold text-emerald-700">{allFollowups.length}</p>
          <p className="text-sm text-emerald-600">Active Queries</p>
        </CardContent></Card>
        <Card className="bg-rose-50 border-rose-100"><CardContent className="pt-5">
          <p className="text-4xl font-bold text-rose-600">{allFollowups.filter(q => q.followup_due && new Date(q.followup_due) < new Date()).length}</p>
          <p className="text-sm text-rose-600">Overdue</p>
        </CardContent></Card>
        <Card className="bg-amber-50 border-amber-100"><CardContent className="pt-5">
          <p className="text-4xl font-bold text-amber-600">{allFollowups.filter(q => q.followup_due && sameDay(q.followup_due, today)).length}</p>
          <p className="text-sm text-amber-600">Due Today</p>
        </CardContent></Card>
        <Card className="bg-blue-50 border-blue-100"><CardContent className="pt-5">
          <p className="text-4xl font-bold text-blue-600">{allFollowups.filter(q => q.followup_due && new Date(q.followup_due) > new Date() && new Date(q.followup_due) < new Date(Date.now() + 7 * DAY)).length}</p>
          <p className="text-sm text-blue-600">Next 7 Days</p>
        </CardContent></Card>
      </div>

      {/* SOD TABLE */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlarmClock className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-slate-800">All Advisor SOD Follow-up Overview</h2>
              <p className="text-xs text-muted-foreground">Daily commitments and risk signals.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3 text-right">Open</th>
                  <th className="p-3 text-right">Overdue</th>
                  <th className="p-3 text-right">Due Today</th>
                  <th className="p-3 text-right">Next 7 Days</th>
                  <th className="p-3 text-right">High Value</th>
                  <th className="p-3 text-right">Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {m.workload.map((row) => {
                  const mine = activeQueries.filter(q => q.owner === row.employee.name);
                  return (
                    <tr key={row.employee.id} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{row.employee.name}</div>
                        <div className="text-xs text-muted-foreground">{row.employee.role}</div>
                      </td>
                      <td className="p-3 text-right">{mine.length}</td>
                      <td className={`p-3 text-right ${row.overdue > 0 ? "font-semibold text-red-600" : ""}`}>{row.overdue}</td>
                      <td className="p-3 text-right">{mine.filter(q => q.followup_due && sameDay(q.followup_due, today)).length}</td>
                      <td className="p-3 text-right">{mine.filter(q => q.followup_due && new Date(q.followup_due) > today && new Date(q.followup_due) < new Date(today.getTime() + 7 * DAY)).length}</td>
                      <td className="p-3 text-right">{mine.filter(q => Number(q.value) >= 100_000).length}</td>
                      <td className="p-3 text-right font-medium">{formatMoney(mine.reduce((sum, q) => sum + (Number(q.value) || 0), 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MAIN CONTENT & SIDEBAR */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* PRIORITY QUEUE LIST */}
        <div className="xl:col-span-9 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Priority Queue</h2>
            <Badge variant="outline">{allFollowups.length}</Badge>
          </div>

          <div className="space-y-3">
            {allFollowups.slice(0, 12).map((query, index) => {
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
                      <div className="text-xs text-muted-foreground">{query.followup_due ? formatDate(query.followup_due) : "No date set"}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-slate-600" onClick={() => handleOpenLogModal(query)}>
                        + Log
                      </Button>
                      <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => openQuery(query)}>
                        Open
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="xl:col-span-3 space-y-6">
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Follow-up discipline</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-800">14</p>
                  <p className="text-[10px] text-muted-foreground">Avg Daily</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">1.5</p>
                  <p className="text-[10px] text-muted-foreground">Overdue Rate</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">25</p>
                  <p className="text-[10px] text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Risk signals</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">High Value</span>
                  <Badge className="bg-amber-100 text-amber-800">32</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">No Follow-up</span>
                  <Badge className="bg-slate-100 text-slate-800">33</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Response Overdue</span>
                  <Badge className="bg-red-100 text-red-800">81</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Executive follow-up workload</h3>
              <div className="space-y-3">
                {m.workload.slice(0, 3).map((row) => (
                  <div key={row.employee.id} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-700">
                        {row.employee.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{row.employee.name}</p>
                        <p className="text-[10px] text-muted-foreground">{row.employee.role}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{row.overdue}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* LOG FOLLOW-UP MODAL */}
      <Dialog open={!!logQuery} onOpenChange={(open) => !open && setLogQuery(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Log Follow-up</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {logQuery?.query_id} • {logQuery?.customer}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if(logQuery) {
              logFollowup(logQuery.query_id, "Follow-up logged", undefined, logQuery.owner || "System");
              setLogQuery(null);
            }
          }}>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">Activity date <span className="text-red-500">*</span></Label>
                <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">Medium <span className="text-red-500">*</span></Label>
                <Select defaultValue="Select">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Select">Select</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Phone">Phone</SelectItem>
                    <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Outcome / note</Label>
                <Textarea placeholder="What was discussed or sent?" rows={4} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="flex items-center gap-1">Next action date <span className="text-red-500">*</span></Label>
                <Input type="date" defaultValue={new Date(Date.now() + DAY).toISOString().split('T')[0]} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white">Save activity</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* UPDATE STATUS MODAL */}
      <Dialog open={!!updateQuery} onOpenChange={(open) => !open && setUpdateQuery(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Update Query Status</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {updateQuery?.query_id} • currently {updateQuery?.stage || "Open"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">New status <span className="text-red-500">*</span></Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nurturing">Nurturing</SelectItem>
                    <SelectItem value="Won">Won</SelectItem>
                    <SelectItem value="Lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason / remark</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Select if applicable" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Budget">Budget</SelectItem>
                    <SelectItem value="Timing">Timing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Internal note</Label>
                <Textarea placeholder="" rows={3} />
              </div>
              <div className="rounded-md bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-800 mb-2">Automatic outcome rules</p>
                <p className="text-xs text-muted-foreground">✓ Won → celebration and Operations Kit hand-off</p>
                <p className="text-xs text-muted-foreground">✓ Lost → reason required and pending tasks closed</p>
              </div>
              <p className="text-xs text-muted-foreground">Every change is added to the query activity history.</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white">Update status</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
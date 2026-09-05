import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  RefreshCcw,
  Plus,
  Users,
  Info,
  Calendar,
  Briefcase,
  Clock,
  CheckCircle2,
  X,
} from "lucide-react";

import {
  useCrmMetrics,
  isOpen,
} from "@/lib/crm/metrics";
import { inr, fmtDate } from "@/components/crm/ui";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Stage } from "@/lib/crm/types";

export default function QueryTracker() {
  const navigate = useNavigate();
  const m = useCrmMetrics();

  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const [stage, setStage] = useState("all");

  // Image ke hisaab se filters
  const [financialYear, setFinancialYear] = useState("FY 2026-27");
  const [queryMonth, setQueryMonth] = useState("All query months");
  const [receivedDate, setReceivedDate] = useState("All dates");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return m.queries.filter((item) => {
      const matchesOwner = owner === "all" || item.owner === owner;
      const matchesStage = stage === "all" || item.stage === stage;
      const searchableValues = [
        item.query_id, item.lead_id, item.customer, item.contact_person,
        item.destination, item.owner, item.lead_source, item.enquiry_type,
        item.market, item.travel_type, item.requirement, item.next_action,
      ];
      const matchesSearch = !query || searchableValues.filter(Boolean).some((value) =>
        String(value).toLowerCase().includes(query)
      );

      return matchesOwner && matchesStage && matchesSearch;
    });
  }, [m.queries, search, owner, stage]);

  const resetFilters = () => {
    setSearch(""); setOwner("all"); setStage("all");
    setFinancialYear("FY 2026-27"); setQueryMonth("All query months"); setReceivedDate("All dates");
  };

  const createQuery = () => navigate({ to: "/new-lead" });

  const openQuery = (queryId: string) => {
    const query = m.queries.find((item) => item.query_id === queryId);
    if (!query) return;
    navigate({ to: "/queries/$id", params: { id: query.id } });
  };

  const getTravelTypePill = (type?: string) => {
    if (!type) return null;
    const isB2B = type.toLowerCase().includes("b2b");
    return (
      <Badge variant="outline" className={`font-medium border-0 px-1.5 py-0 text-[10px] ${isB2B ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600"}`}>
        {type.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">MP Tourism Operations Hub / Queries</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">All Queries</h1>
          <p className="mt-1 text-sm text-muted-foreground">334 populated queries from the FY 2026-27 tracker.</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="mr-2 h-4 w-4" /> Create Query
        </Button>
      </div>

      {/* QUERY HEALTH MONITOR + FILTERS */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-5 space-y-5">
          {/* Health Monitor Bar */}
          <div className="flex items-center gap-3 bg-blue-50/50 border border-blue-100 rounded-lg p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-blue-100">
              <Info className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Query Health Monitor</p>
              <p className="text-xs text-muted-foreground">Monitor lead health by financial year, multiple months, a specific received date, week or custom duration.</p>
            </div>
          </div>

          {/* Row 1: Basic Filters */}
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1 space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Search</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search query no., partner, contact or program"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">All statuses</p>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {["New", "Working", "Nurturing", "Won", "Lost"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">All advisors</p>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All advisors</SelectItem>
                    {m.employees.filter(e => e.active !== false).map((e) => (
                      <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={resetFilters}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Row 2: Dropdown Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Financial Year</p>
              <Select value={financialYear} onValueChange={setFinancialYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="FY 2026-27">FY 2026-27</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Query Month</p>
              <Select value={queryMonth} onValueChange={setQueryMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All query months">All query months</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Received Date / Period</p>
              <Select value={receivedDate} onValueChange={setReceivedDate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All dates">All dates</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Lead Source</p>
              <Select defaultValue="All lead sources">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All lead sources">All lead sources</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Market Channel</p>
              <Select defaultValue="All market channels">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All market channels">All market channels</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: More Dropdown Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Query Type</p>
              <Select defaultValue="All query types">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All query types">All query types</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Costing Basis</p>
              <Select defaultValue="All costing bases">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All costing bases">All costing bases</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Travel Month</p>
              <Select defaultValue="All travel months">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All travel months">All travel months</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Travel Agent</p>
              <Select defaultValue="All travel agents">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All travel agents">All travel agents</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Due Status</p>
              <Select defaultValue="All due periods">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All due periods">All due periods</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-50/80 border-slate-200 rounded-xl">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">Filtered queries</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-4xl font-bold text-slate-900">334</p>
              <p className="text-[10px] text-slate-500">Queries matching the current tracker scope</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50 border-blue-100 rounded-xl">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">New & working</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-4xl font-bold text-slate-900">2</p>
              <p className="text-[10px] text-slate-500">12.5 L being prepared</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50/50 border-orange-100 rounded-xl">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">Nurturing</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-4xl font-bold text-slate-900">101</p>
              <p className="text-[10px] text-slate-500">1.36 Cr under follow-up</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50/50 border-yellow-100 rounded-xl">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-slate-800">Won</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-4xl font-bold text-slate-900">41</p>
              <p className="text-[10px] text-slate-500">112.8 L confirmed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TABLE */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Query</TableHead>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Received</TableHead>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Partner / Client</TableHead>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Travel plan</TableHead>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Costing basis</TableHead>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Pax</TableHead>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Value</TableHead>
                  <TableHead className="text-[10px] font-semibold text-slate-500 uppercase">Executive</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 30).map((q) => (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer hover:bg-slate-50/50 border-slate-100"
                    onClick={() => openQuery(q.query_id)}
                  >
                    {/* Query */}
                    <TableCell className="py-4 align-top">
                      <div className="text-xs font-bold text-blue-600">{q.query_id}</div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-1">
                        B2B • Regular<br />Tour Package
                      </div>
                      {q.lead_source && (
                        <div className="mt-1">{getTravelTypePill(q.lead_source)}</div>
                      )}
                    </TableCell>

                    {/* Received */}
                    <TableCell className="py-4 align-top">
                      <div className="text-xs font-medium text-slate-800">{fmtDate(q.created_at)}</div>
                      <div className="text-[10px] text-slate-500 mt-1">Monday</div>
                    </TableCell>

                    {/* Partner / Client */}
                    <TableCell className="py-4 align-top">
                      <div className="text-sm font-semibold text-slate-900">{q.customer || "Direct Query"}</div>
                      <div className="text-[10px] text-slate-500 mt-1 truncate max-w-[180px]">
                        {q.contact_person || "N/A"}
                      </div>
                    </TableCell>

                    {/* Travel Plan */}
                    <TableCell className="py-4 align-top">
                      <div className="text-xs font-medium text-slate-800 truncate max-w-[200px]">
                        {q.destination || "Destination not set"}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {q.travel_start ? fmtDate(q.travel_start) : "—"} – {q.travel_end ? fmtDate(q.travel_end) : "—"}
                      </div>
                      <div className="mt-1">
                        {getTravelTypePill(q.travel_type || q.enquiry_type)}
                      </div>
                    </TableCell>

                    {/* Costing Basis */}
                    <TableCell className="py-4 align-top">
                      <Badge variant="outline" className="text-[10px] font-medium text-slate-600 border-slate-200">
                        {q.enquiry_type || "B2B"}
                      </Badge>
                    </TableCell>

                    {/* Pax */}
                    <TableCell className="py-4 align-top">
                      <div className="text-xs font-bold text-slate-800">{q.pax || 0}-{q.pax || 0} Pax</div>
                      <div className="text-[10px] text-slate-500 mt-1">Travelers</div>
                    </TableCell>

                    {/* Value */}
                    <TableCell className="py-4 align-top">
                      <div className="text-xs font-bold text-slate-800 text-right">
                        {inr(Number(q.value) || 0)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 text-right">
                        {inr(Number(q.value) || 0)}
                      </div>
                    </TableCell>

                    {/* Executive */}
                    <TableCell className="py-4 align-top">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
                          {(q.owner || "U").charAt(0)}
                        </div>
                        <div className="text-xs font-medium text-slate-800 whitespace-nowrap">
                          {q.owner || "Unassigned"}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* FOOTER */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Showing 1-12 of 334</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>1</Button>
          <Button variant="outline" size="sm">2</Button>
          <Button variant="outline" size="sm">→</Button>
        </div>
      </div>
    </div>
  );
}
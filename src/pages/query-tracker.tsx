import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download } from "lucide-react";
import { useCrmMetrics, isOpen, sameDay } from "@/lib/crm/metrics";
import { StageBadge, inr, fmtDate, fmtTime } from "@/components/crm/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssignLeadsDialog, ReassignQuery } from "@/components/crm/assign";

export default function QueryTracker() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const m = useCrmMetrics();

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return m.queries.filter(
      (q) =>
        (owner === "all" || q.owner === owner) &&
        (!s ||
          q.query_id.toLowerCase().includes(s) ||
          q.customer.toLowerCase().includes(s) ||
          q.destination.toLowerCase().includes(s) ||
          q.owner.toLowerCase().includes(s)),
    );
  }, [m.queries, search, owner]);

  const exportCsv = () => {
    const rows = [
      ["Query ID", "Travel Dates", "Destination", "Travel Type", "Customer", "Stage", "Owner", "Value", "Next Action", "Follow-up Due"],
      ...filtered.map((q) => [
        q.query_id, `${q.travel_start} → ${q.travel_end}`, q.destination, q.travel_type, q.customer,
        q.stage, q.owner, String(q.value), q.next_action, q.followup_due,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const assigned = filtered.filter(isOpen).length;
  const sentToday = filtered.filter((q) => q.stage === "Quotation Sent" && sameDay(q.created_at, m.today)).length
    || m.quotesSentToday;
  const followupsDue = filtered.filter((q) => isOpen(q) && sameDay(q.followup_due, m.today)).length;
  const overdue = filtered.filter((q) => isOpen(q) && new Date(q.followup_due).getTime() < m.today.getTime()).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Query Tracker</h1>
        <p className="text-sm text-muted-foreground">Track and manage all queries and their progress</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assigned Queries</p>
                <p className="text-2xl font-bold">{assigned}</p>
              </div>
              <Badge variant="secondary">Active</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sent Today</p>
                <p className="text-2xl font-bold">{sentToday}</p>
              </div>
              <Badge variant="secondary">Quotes</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Follow-ups Due</p>
                <p className="text-2xl font-bold">{followupsDue}</p>
              </div>
              <Badge variant="secondary">Today</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{overdue}</p>
              </div>
              <Badge variant="destructive">Action Required</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Query ID, Customer, Destination or Owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All owners" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {m.employees.map((e) => (
              <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query ID</TableHead>
                <TableHead>Travel Dates</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Travel Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Query Owner</TableHead>
                <TableHead>Query Value</TableHead>
                <TableHead>Next Action</TableHead>
                <TableHead>Follow-up Due</TableHead>
                <TableHead>Reassign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No queries found. Create a new lead to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice(0, 100).map((q) => (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate({ to: "/query/$queryId", params: { queryId: q.query_id } })}
                  >
                    <TableCell className="font-medium text-blue-600">{q.query_id}</TableCell>
                    <TableCell>{fmtDate(q.travel_start)} – {fmtDate(q.travel_end)}</TableCell>
                    <TableCell>{q.destination}</TableCell>
                    <TableCell>{q.travel_type}</TableCell>
                    <TableCell>{q.customer}</TableCell>
                    <TableCell><StageBadge stage={q.stage} /></TableCell>
                    <TableCell>{q.owner}</TableCell>
                    <TableCell className="font-medium">{inr(q.value)}</TableCell>
                    <TableCell>{q.next_action}</TableCell>
                    <TableCell>{fmtTime(q.followup_due)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ReassignQuery queryId={q.query_id} owner={q.owner} className="w-[170px] h-8" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Showing {Math.min(filtered.length, 100)} of {filtered.length} matching queries ({m.totalQueries} total)
      </p>
    </div>
  );
}

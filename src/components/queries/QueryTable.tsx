// Main Query Tracking list view.
import { useMemo, useState } from "react";
import { Pencil, Trash2, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQueries, updateQuery, deleteQuery } from "@/lib/queries/store";
import { derive } from "@/lib/queries/derive";
import { usePeriodRules } from "@/lib/queries/periods";
import { FINAL_STATUSES, type FinalLeadStatus, type QueryRecord } from "@/lib/queries/types";
import { QueryFormDialog } from "./QueryFormDialog";

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function statusTone(s: FinalLeadStatus) {
  if (s === "WIN") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "LOST") return "bg-destructive/10 text-destructive border-destructive/20";
  if (s === "Working") return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "Nurturing") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-muted text-muted-foreground border-border";
}

export const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

export function QueryTable() {
  const list = useQueries();
  const rules = usePeriodRules();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | FinalLeadStatus>("all");
  const [advisor, setAdvisor] = useState("all");
  const [month, setMonth] = useState("all");
  const [sortKey, setSortKey] = useState<"query_date" | "tour_starting_date" | "amount">("query_date");
  const [editing, setEditing] = useState<QueryRecord | null>(null);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const enriched = list.map((r) => ({ r, d: derive(r, rules) }));
    const advisors = new Set<string>();
    const months = new Set<string>();
    enriched.forEach(({ r, d }) => {
      if (r.travel_advisor) advisors.add(r.travel_advisor);
      if (d.travel_month) months.add(d.travel_month);
    });
    const term = q.trim().toLowerCase();
    const filtered = enriched.filter(({ r, d }) => {
      if (status !== "all" && r.final_status !== status) return false;
      if (advisor !== "all" && r.travel_advisor !== advisor) return false;
      if (month !== "all" && d.travel_month !== month) return false;
      if (!term) return true;
      return [r.query_no, r.contact_person, r.query_source_name, r.contact_number, r.email_id,
        r.interested_program_name, r.tour_starting_city]
        .some((v) => (v || "").toLowerCase().includes(term));
    });
    filtered.sort((a, b) => {
      if (sortKey === "amount") return b.d.total_amount - a.d.total_amount;
      return (b.r[sortKey] || "").localeCompare(a.r[sortKey] || "");
    });
    return { filtered, advisors: [...advisors].sort(), months: [...months] };
  }, [list, rules, q, status, advisor, month, sortKey]);

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search query no, contact, source, program…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          {FINAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectCls} value={advisor} onChange={(e) => setAdvisor(e.target.value)}>
          <option value="all">All advisors</option>
          {rows.advisors.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select className={selectCls} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All travel months</option>
          {rows.months.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className={selectCls} value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
          <option value="query_date">Sort: Query date</option>
          <option value="tour_starting_date">Sort: Travel date</option>
          <option value="amount">Sort: Amount</option>
        </select>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Query
        </Button>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Query No</th>
              <th className="text-left p-3">Query Date</th>
              <th className="text-left p-3">Source / Contact</th>
              <th className="text-left p-3">Advisor</th>
              <th className="text-left p-3">Travel</th>
              <th className="text-left p-3">Duration</th>
              <th className="text-left p-3">Period</th>
              <th className="text-right p-3">Pax</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.filtered.length === 0 && (
              <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">No queries match your filters.</td></tr>
            )}
            {rows.filtered.map(({ r, d }) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{r.query_no}</td>
                <td className="p-3 whitespace-nowrap">{r.query_date}<div className="text-xs text-muted-foreground">{d.query_day}</div></td>
                <td className="p-3">
                  <div className="font-medium">{r.query_source_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.contact_person} {r.contact_number && `· ${r.contact_number}`}</div>
                </td>
                <td className="p-3">{r.travel_advisor || "—"}</td>
                <td className="p-3 whitespace-nowrap">
                  {r.tour_starting_date || "—"}
                  <div className="text-xs text-muted-foreground">{d.travel_month}</div>
                </td>
                <td className="p-3 whitespace-nowrap">{d.tour_duration || "—"}</td>
                <td className="p-3 text-xs">{d.travel_period || "—"}</td>
                <td className="p-3 text-right">{r.no_of_pax}</td>
                <td className="p-3 text-right font-medium">{inr(d.total_amount)}</td>
                <td className="p-3">
                  <select
                    className={cn("h-8 rounded-md border px-2 text-xs font-semibold", statusTone(r.final_status))}
                    value={r.final_status}
                    onChange={(e) => {
                      updateQuery(r.id, { final_status: e.target.value as FinalLeadStatus });
                      toast.success(`${r.query_no} marked ${e.target.value}.`);
                    }}
                  >
                    {FINAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost"
                    onClick={() => { if (confirm(`Delete ${r.query_no}?`)) { deleteQuery(r.id); toast.success("Deleted."); } }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{rows.filtered.length} shown</Badge>
        <Badge variant="secondary">{list.length} total</Badge>
      </div>

      <QueryFormDialog open={open} onOpenChange={setOpen} record={editing} />
    </div>
  );
}

// Won (converted) queries — separate list.
import { useMemo, useState } from "react";
import { Trophy, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWonQueries } from "@/lib/queries/store";
import { derive } from "@/lib/queries/derive";
import { usePeriodRules } from "@/lib/queries/periods";
import type { QueryRecord } from "@/lib/queries/types";
import { QueryFormDialog } from "./QueryFormDialog";
import { inr } from "./QueryTable";

export function WonQueries() {
  const won = useWonQueries();
  const rules = usePeriodRules();
  const [editing, setEditing] = useState<QueryRecord | null>(null);
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () => won.map((r) => ({ r, d: derive(r, rules) }))
      .sort((a, b) => (b.r.won_at || "").localeCompare(a.r.won_at || "")),
    [won, rules],
  );
  const totalValue = rows.reduce((s, x) => s + x.d.total_amount, 0);
  const totalPax = rows.reduce((s, x) => s + (Number(x.r.no_of_pax) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Won Queries" value={String(rows.length)} />
        <Stat label="Total Value" value={inr(totalValue)} />
        <Stat label="Total Pax" value={String(totalPax)} />
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Query No</th>
              <th className="text-left p-3">Source / Contact</th>
              <th className="text-left p-3">Advisor</th>
              <th className="text-left p-3">Travel Month</th>
              <th className="text-left p-3">Duration</th>
              <th className="text-right p-3">Pax</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Won On</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-muted-foreground">
                  <Trophy className="h-9 w-9 mx-auto mb-2 text-muted-foreground/30" />
                  No won queries yet. Mark a query as WIN to see it here.
                </td>
              </tr>
            )}
            {rows.map(({ r, d }) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{r.query_no}</td>
                <td className="p-3">
                  <div className="font-medium">{r.query_source_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.contact_person}</div>
                </td>
                <td className="p-3">{r.travel_advisor || "—"}</td>
                <td className="p-3">{d.travel_month || "—"}</td>
                <td className="p-3">{d.tour_duration || "—"}</td>
                <td className="p-3 text-right">{r.no_of_pax}</td>
                <td className="p-3 text-right font-medium">{inr(d.total_amount)}</td>
                <td className="p-3 text-xs">{r.won_at ? new Date(r.won_at).toLocaleString("en-IN") : "—"}</td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <QueryFormDialog open={open} onOpenChange={setOpen} record={editing} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

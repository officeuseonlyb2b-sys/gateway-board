// Editable "Travel Period Marked As" classification rules.
import { useState } from "react";
import { Plus, Trash2, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usePeriodRules, addPeriodRule, updatePeriodRule, deletePeriodRule, classifyDate,
} from "@/lib/queries/periods";

export function PeriodRulesPanel() {
  const rules = usePeriodRules();
  const [draft, setDraft] = useState({ label: "", start: "", end: "", priority: 20 });
  const [testDate, setTestDate] = useState("");

  function add() {
    if (!draft.label || !draft.start || !draft.end) {
      toast.error("Label, start and end dates are required.");
      return;
    }
    addPeriodRule(draft);
    setDraft({ label: "", start: "", end: "", priority: 20 });
    toast.success("Rule added.");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarRange className="h-4 w-4 text-accent" />
          <div className="font-semibold text-sm">Add Period Rule</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-5 items-end">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Label</Label>
            <Input value={draft.label} placeholder="Long Weekend - Holi"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Start</Label>
            <Input type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">End</Label>
            <Input type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Input type="number" value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })} />
            </div>
            <Button className="mt-6" onClick={add}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Label</th>
              <th className="text-left p-3 w-40">Start</th>
              <th className="text-left p-3 w-40">End</th>
              <th className="text-left p-3 w-28">Priority</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No rules yet.</td></tr>
            )}
            {[...rules].sort((a, b) => a.start.localeCompare(b.start)).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <Input value={r.label} onChange={(e) => updatePeriodRule(r.id, { label: e.target.value })} />
                </td>
                <td className="p-2">
                  <Input type="date" value={r.start} onChange={(e) => updatePeriodRule(r.id, { start: e.target.value })} />
                </td>
                <td className="p-2">
                  <Input type="date" value={r.end} onChange={(e) => updatePeriodRule(r.id, { end: e.target.value })} />
                </td>
                <td className="p-2">
                  <Input type="number" value={r.priority}
                    onChange={(e) => updatePeriodRule(r.id, { priority: Number(e.target.value) || 0 })} />
                </td>
                <td className="p-2 text-center">
                  <Button size="icon" variant="ghost" onClick={() => { deletePeriodRule(r.id); toast.success("Rule removed."); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <div className="font-semibold text-sm mb-3">Test a date</div>
        <div className="flex flex-wrap items-center gap-3">
          <Input type="date" className="w-48" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
          <div className="text-sm">
            Marked as: <span className="font-semibold text-accent">{classifyDate(testDate, rules) || "—"}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Dates outside every rule fall back to Regular Dates - Weekend (Fri/Sat/Sun) or Regular Dates - Weekday.
        </p>
      </Card>
    </div>
  );
}

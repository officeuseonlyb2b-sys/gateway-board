// Shared assignment controls for the CRM: owner picker, task dialog and the
// Manager Dashboard bulk "Assign Leads" flow. All mutations go through
// src/lib/crm/store.ts — no separate data source.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { addTask, reassignQuery, useCrmQueries, useEmployees } from "@/lib/crm/store";
import { LEAD_PRIORITIES } from "@/lib/crm/types";
import { useAuth } from "@/lib/auth-mock";

/** Name of the person performing the action (falls back to first employee). */
export function useActor(): string {
  const user = useAuth();
  const employees = useEmployees();
  return employees.find((e) => e.email === user?.email)?.name ?? user?.name ?? "Admin";
}

export function OwnerSelect({
  value, onChange, placeholder = "Assign to…", className,
}: { value: string; onChange: (name: string) => void; placeholder?: string; className?: string }) {
  const employees = useEmployees().filter((e) => e.active !== false);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {employees.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">No employees yet — add them in Users &amp; Roles.</div>
        ) : employees.map((e) => (
          <SelectItem key={e.id} value={e.name}>{e.name} — {e.role}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Inline reassign control for a single query — captures a reason. */
export function ReassignQuery({ queryId, owner, className }: { queryId: string; owner: string; className?: string }) {
  const actor = useActor();
  const employees = useEmployees().filter((e) => e.active !== false);
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (employees.length === 0) {
    return <p className={`text-xs text-muted-foreground ${className ?? ""}`}>No employees available. Please add employees in Users &amp; Roles.</p>;
  }

  return (
    <>
      <OwnerSelect
        className={className}
        value={owner}
        placeholder="Unassigned"
        onChange={(name) => { if (name !== owner) setPending(name); }}
      />
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign lead</DialogTitle>
            <DialogDescription>
              {owner ? `Transfer from ${owner} to ${pending}.` : `Assign to ${pending}.`} The previous owner and this reason are kept in the lead history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason for reassignment</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Owner on leave / workload balancing" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPending(null); setReason(""); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!pending) return;
                reassignQuery(queryId, pending, actor, reason.trim() || undefined);
                toast.success(`${queryId} reassigned to ${pending}`);
                setPending(null); setReason("");
              }}
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Create a task explicitly assigned to an employee. */
export function NewTaskDialog({ queryId, trigger }: { queryId?: string; trigger?: React.ReactNode }) {
  const actor = useActor();
  const queries = useCrmQueries();
  const employees = useEmployees().filter((e) => e.active !== false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState(() => {
    const d = new Date(Date.now() + 864e5);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [query, setQuery] = useState(queryId ?? "");

  const submit = () => {
    if (employees.length === 0) { toast.error("No employees available. Please add employees in Users & Roles."); return; }
    if (!title.trim()) { toast.error("Add a task title."); return; }
    if (!owner) { toast.error("Choose who this task is assigned to."); return; }
    const task = addTask(
      { title: title.trim(), query_id: query, due_at: new Date(due).toISOString(), owner, note: note.trim() || undefined, priority },
      actor,
    );
    toast.success(`Task assigned to ${owner}`, { description: task.title });
    setTitle(""); setNote(""); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm" variant="outline">New Task</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>Assign a task to a specific employee — it appears on their My Tasks.</DialogDescription>
        </DialogHeader>
        {employees.length === 0 ? (
          <p className="text-sm text-destructive">No employees available. Please add employees in Users &amp; Roles.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send revised quotation" />
            </div>
            {!queryId && (
              <div className="space-y-2">
                <Label>Linked Lead / Query</Label>
                <Select value={query || undefined} onValueChange={setQuery}>
                  <SelectTrigger><SelectValue placeholder="Select query (optional)" /></SelectTrigger>
                  <SelectContent>
                    {queries.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-muted-foreground">No leads yet.</div>
                    ) : queries.map((q) => <SelectItem key={q.id} value={q.query_id}>{q.query_id} — {q.customer}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due</Label>
                <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Assign To</Label>
                <OwnerSelect value={owner} onChange={setOwner} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={employees.length === 0}>Create &amp; Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/** Bulk lead assignment used by the Manager Dashboard quick action. */
export function AssignLeadsDialog({ trigger }: { trigger: React.ReactNode }) {
  const actor = useActor();
  const queries = useCrmQueries();
  const employees = useEmployees().filter((e) => e.active !== false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [owner, setOwner] = useState("");

  const candidates = useMemo(
    () => queries.filter((q) => q.stage !== "Confirmed" && q.stage !== "Lost"),
    [queries],
  );

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const apply = () => {
    if (!owner) { toast.error("Pick an employee."); return; }
    if (picked.length === 0) { toast.error("Select at least one lead."); return; }
    picked.forEach((qid) => reassignQuery(qid, owner, actor));
    toast.success(`${picked.length} lead(s) assigned to ${owner}`);
    setPicked([]);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign leads</DialogTitle>
          <DialogDescription>Select leads and the employee who should own them.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Assign To</Label>
          <OwnerSelect value={owner} onChange={setOwner} />
        </div>

        <div className="max-h-[320px] overflow-auto rounded-md border divide-y">
          {candidates.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No open leads to assign.</p>
          )}
          {candidates.map((q) => (
            <label key={q.id} className="flex items-center gap-3 p-3 text-sm cursor-pointer hover:bg-muted/50">
              <Checkbox checked={picked.includes(q.query_id)} onCheckedChange={() => toggle(q.query_id)} />
              <span className="font-medium">{q.query_id}</span>
              <span className="text-muted-foreground">{q.customer} • {q.destination} • {q.stage}</span>
              <span className="ml-auto text-xs text-muted-foreground">Owner: {q.owner || "Unassigned"}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={apply} disabled={employees.length === 0}>Assign {picked.length || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

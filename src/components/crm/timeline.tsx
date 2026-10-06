// Lead activity timeline + quick actions. Reads/writes only through
// src/lib/crm/store.ts so every action lands in the shared CRM event log.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Phone,
  PhoneOff,
  MessageCircle,
  Mail,
  CalendarPlus,
  CheckCircle2,
  RefreshCw,
  FileText,
  Trophy,
  XCircle,
  Activity,
} from "lucide-react";
import {
  completeFollowup,
  logCall,
  logLeadActivity,
  scheduleFollowup,
  setQueryPriority,
  setQueryStage,
  useCrmEvents,
} from "@/lib/crm/store";
import { EVENT_LABELS, LEAD_PRIORITIES, type CrmEvent, type CrmQuery } from "@/lib/crm/types";
import { fmtTime } from "@/components/crm/ui";
import { NewTaskDialog, ReassignQuery, useActor } from "@/components/crm/assign";

const DOT: Partial<Record<CrmEvent["type"], string>> = {
  lead_created: "bg-sky-500",
  lead_assigned: "bg-indigo-500",
  lead_reassigned: "bg-indigo-500",
  call_connected: "bg-emerald-500",
  call_not_connected: "bg-rose-400",
  whatsapp_sent: "bg-emerald-600",
  email_sent: "bg-sky-600",
  followup_created: "bg-violet-500",
  followup_completed: "bg-emerald-500",
  followup_overdue: "bg-rose-500",
  followup_missed: "bg-rose-600",
  quotation_started: "bg-amber-500",
  quotation_sent: "bg-emerald-600",
  quotation_updated: "bg-amber-600",
  negotiation_started: "bg-purple-500",
  priority_changed: "bg-orange-500",
  stage_changed: "bg-slate-500",
  task_assigned: "bg-cyan-500",
  task_completed: "bg-emerald-500",
  won: "bg-emerald-600",
  lost: "bg-rose-600",
};

export function PriorityBadge({ priority, className }: { priority?: string; className?: string }) {
  const p = priority || "Normal";
  const tone =
    p === "Urgent"
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : p === "High"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : p === "Low"
          ? "bg-slate-100 text-slate-600 border-slate-200"
          : "bg-sky-100 text-sky-700 border-sky-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      {p}
    </span>
  );
}

/** Full permanent activity timeline for one lead. */
export function LeadTimeline({ queryId, limit }: { queryId: string; limit?: number }) {
  const events = useCrmEvents();
  const items = useMemo(() => {
    const list = events
      .filter((e) => e.query_id === queryId)
      .slice()
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    return limit ? list.slice(0, limit) : list;
  }, [events, queryId, limit]);

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No activity recorded on this lead yet.</p>;
  }

  return (
    <ol className="relative pl-5">
      <span className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
      {items.map((e) => (
        <li key={e.id} className="relative pb-4">
          <span
            className={cn(
              "absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full",
              DOT[e.type] ?? "bg-slate-400",
            )}
          />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{EVENT_LABELS[e.type] ?? e.type}</span>
            <span className="text-xs text-muted-foreground">{fmtTime(e.at)}</span>
            <span className="text-xs text-muted-foreground">• {e.by}</span>
          </div>
          <p className="text-sm text-foreground/80">{e.title}</p>
          {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
          {(e.prev_value || e.new_value) && (
            <p className="text-xs mt-0.5">
              <span className="text-muted-foreground">{e.prev_value || "—"}</span>
              <span className="mx-1">→</span>
              <span className="font-medium">{e.new_value || "—"}</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 864e5);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function FollowupDialog({
  query,
  trigger,
  complete,
}: {
  query: CrmQuery;
  trigger: React.ReactNode;
  complete?: boolean;
}) {
  const actor = useActor();
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(() => toLocalInput(query.followup_due));
  const [note, setNote] = useState("");

  const submit = () => {
    if (complete) {
      completeFollowup(
        query.query_id,
        note.trim() || undefined,
        new Date(due).toISOString(),
        actor,
      );
      toast.success("Follow-up completed");
    } else {
      scheduleFollowup(
        query.query_id,
        new Date(due).toISOString(),
        note.trim() || undefined,
        actor,
      );
      toast.success("Follow-up scheduled");
    }
    setNote("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{complete ? "Complete follow-up" : "Add follow-up"}</DialogTitle>
          <DialogDescription>
            {complete
              ? "Record the outcome and schedule the next follow-up."
              : "Set the next follow-up date and time for this lead."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{complete ? "Next follow-up" : "Follow-up date & time"}</Label>
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was discussed / planned?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{complete ? "Mark completed" : "Save follow-up"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Right-panel quick actions for the lead details page. */
export function LeadQuickActions({ query }: { query: CrmQuery }) {
  const actor = useActor();
  const q = query;
  const act = (fn: () => void, msg: string) => {
    fn();
    toast.success(msg);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            act(() => logCall(q.query_id, true, undefined, actor), "Call logged as connected")
          }
        >
          <Phone className="h-3.5 w-3.5 mr-1" /> Call
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            act(() => logCall(q.query_id, false, undefined, actor), "Call logged as not connected")
          }
        >
          <PhoneOff className="h-3.5 w-3.5 mr-1" /> No answer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            act(
              () =>
                logLeadActivity(q.query_id, "whatsapp_sent", {
                  by: actor,
                  title: `WhatsApp sent by ${actor}`,
                  detail: q.mobile || q.contact_person,
                }),
              "WhatsApp logged",
            )
          }
        >
          <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            act(
              () =>
                logLeadActivity(q.query_id, "email_sent", {
                  by: actor,
                  title: `Email sent by ${actor}`,
                  detail: q.email || q.contact_person,
                }),
              "Email logged",
            )
          }
        >
          <Mail className="h-3.5 w-3.5 mr-1" /> Email
        </Button>
        <FollowupDialog
          query={q}
          trigger={
            <Button size="sm" variant="outline">
              <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Follow-up
            </Button>
          }
        />
        <FollowupDialog
          complete
          query={q}
          trigger={
            <Button size="sm" variant="outline">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete
            </Button>
          }
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            act(
              () =>
                logLeadActivity(q.query_id, "customer_replied", {
                  by: actor,
                  title: `Customer replied (${actor})`,
                }),
              "Reply logged",
            )
          }
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Replied
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            act(
              () =>
                logLeadActivity(q.query_id, "negotiation_started", {
                  by: actor,
                  title: `Negotiation started by ${actor}`,
                }),
              "Negotiation logged",
            )
          }
        >
          <Activity className="h-3.5 w-3.5 mr-1" /> Negotiate
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link
            to="/costing"
            search={{ id: undefined }}
            onClick={() =>
              logLeadActivity(q.query_id, "quotation_started", {
                by: actor,
                title: `Quotation started by ${actor}`,
                detail: q.query_id,
              })
            }
          >
            <FileText className="h-3.5 w-3.5 mr-1" /> Quotation
          </Link>
        </Button>
        <NewTaskDialog
          queryId={q.query_id}
          trigger={
            <Button size="sm" variant="secondary">
              Create Task
            </Button>
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Reassign owner</Label>
        <ReassignQuery queryId={q.query_id} owner={q.owner} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Priority</Label>
        <Select
          value={q.priority || "Medium"}
          onValueChange={(v) => {
            setQueryPriority(q.query_id, v, actor);
            toast.success(`Priority set to ${v}`);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => act(() => setQueryStage(q.query_id, "Won", actor), "Lead marked won")}
        >
          <Trophy className="h-3.5 w-3.5 mr-1" /> Converted
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            const reason = window.prompt("Lost reason (required):");
            if (!reason?.trim()) return;
            act(
              () => setQueryStage(q.query_id, "Lost", actor, { reason: reason.trim() }),
              "Lead marked lost",
            );
          }}
        >
          <XCircle className="h-3.5 w-3.5 mr-1" /> Mark Lost
        </Button>
      </div>
    </div>
  );
}

export { FollowupDialog };

import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, CheckCircle, Circle, Phone, Mail, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { logFollowup, reassignTask, setQueryStage, useCrmEvents, useCrmQueries, useCrmTasks } from "@/lib/crm/store";
import { STAGES, type Stage } from "@/lib/crm/types";
import { StageBadge, fmtDate, fmtTime, inr } from "@/components/crm/ui";
import { NewTaskDialog, OwnerSelect, ReassignQuery, useActor } from "@/components/crm/assign";

export default function QueryDetail() {
  const { queryId } = useParams({ from: "/_authenticated/query/$queryId" });
  const queries = useCrmQueries();
  const events = useCrmEvents();
  const allTasks = useCrmTasks();
  const actor = useActor();
  const data = queries.find((q) => q.query_id === queryId || q.id === queryId);

  const feed = useMemo(
    () => events.filter((e) => e.query_id === data?.query_id).slice(0, 12),
    [events, data?.query_id],
  );

  const assignHistory = useMemo(
    () => events
      .filter((e) => e.query_id === data?.query_id && (e.type === "lead_assigned" || e.type === "lead_reassigned"))
      .slice()
      .sort((a, b) => (a.at < b.at ? -1 : 1)),
    [events, data?.query_id],
  );

  const queryTasks = useMemo(
    () => allTasks.filter((t) => t.query_id === data?.query_id),
    [allTasks, data?.query_id],
  );

  if (!data) {
    return (
      <div className="p-6 space-y-3">
        <p>Query not found.</p>
        <Button asChild variant="outline"><Link to="/query-tracker">Back to Query Tracker</Link></Button>
      </div>
    );
  }

  const c = data.commercials;
  const margin = c.selling_price - c.cost_price;
  const marginPct = c.selling_price ? (margin / c.selling_price) * 100 : 0;
  const commission = (c.selling_price * c.commission_pct) / 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => window.history.back()} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{data.query_id} • {data.customer}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <StageBadge stage={data.stage} />
              <span className="text-sm text-muted-foreground">{data.travel_type}</span>
              <span className="text-sm text-muted-foreground">{data.destination}</span>
              <span className="text-sm text-muted-foreground">{fmtDate(data.travel_start)} – {fmtDate(data.travel_end)}</span>
              <span className="text-sm text-muted-foreground">Owner: {data.owner}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={data.stage} onValueChange={(v) => { setQueryStage(data.query_id, v as Stage); toast.success(`Stage changed to ${v}`); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { logFollowup(data.query_id, `Follow-up call with ${data.customer}`); toast.success("Follow-up logged"); }}
          >
            Log Follow-up
          </Button>
          <ReassignQuery queryId={data.query_id} owner={data.owner} className="w-[200px]" />
          <NewTaskDialog queryId={data.query_id} />
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="requirement">Requirement</TabsTrigger>
          <TabsTrigger value="commercials">Commercials</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-3 gap-6">
            <Card className="col-span-2">
              <CardHeader><CardTitle className="text-base">Query Overview</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Travel Partner</p>
                  <p className="font-medium">{data.customer}</p>
                  <p className="text-sm">{data.contact_person}</p>
                  {data.mobile && <div className="flex items-center gap-2 text-sm"><Phone className="h-3 w-3" /> {data.mobile}</div>}
                  {data.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-3 w-3" /> {data.email}</div>}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Market</p>
                  <p className="font-medium">{data.market}</p>
                  <p className="text-sm text-muted-foreground mt-2">Source</p>
                  <p>{data.lead_source}</p>
                  <p className="text-sm text-muted-foreground mt-2">Lead ID</p>
                  <p>{data.lead_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Travel Dates</p>
                  <p className="font-medium">{fmtDate(data.travel_start)} – {fmtDate(data.travel_end)}</p>
                  <p className="text-sm text-muted-foreground mt-2">Destination</p>
                  <p>{data.destination}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">No. of Travellers</p>
                  <p className="font-medium">{data.pax} Pax ({data.adults} Adults, {data.children} Children)</p>
                  <p className="text-sm text-muted-foreground mt-2">Enquiry Type</p>
                  <p>{data.enquiry_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Assigned On</p>
                  <p>{fmtTime(data.assigned_on)}</p>
                  <p className="text-sm text-muted-foreground mt-2">Current Stage</p>
                  <StageBadge stage={data.stage} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Next Action</p>
                  <p>{data.next_action}</p>
                  <p className="text-sm text-muted-foreground mt-2">Follow-up Due</p>
                  <p>{fmtTime(data.followup_due)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Lifecycle Progress</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.lifecycle.map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className="mt-1">
                      {item.at
                        ? <CheckCircle className="h-4 w-4 text-green-500" />
                        : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.at ? fmtTime(item.at) : "Pending"}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Latest Activity</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {feed.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
              {feed.map((act) => (
                <div key={act.id} className="flex items-start gap-3 border-b pb-2 last:border-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm">{act.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtTime(act.at)} · {act.by}{act.detail ? ` · ${act.detail}` : ""}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Commercial Snapshot</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div><p className="text-sm text-muted-foreground">Cost Price</p><p className="font-bold">{inr(c.cost_price)}</p></div>
                <div><p className="text-sm text-muted-foreground">Selling Price</p><p className="font-bold">{inr(c.selling_price)}</p></div>
                <div><p className="text-sm text-muted-foreground">Margin</p><p className="font-bold text-green-600">{inr(margin)}</p></div>
                <div><p className="text-sm text-muted-foreground">Agent Commission ({c.commission_pct}%)</p><p className="font-bold">{inr(commission)}</p></div>
                <div><p className="text-sm text-muted-foreground">Net After Commission</p><p className="font-bold">{inr(c.selling_price - commission)}</p></div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Progress value={Math.max(0, Math.min(100, marginPct))} className="w-full" />
                <span className="text-sm font-medium whitespace-nowrap">{marginPct.toFixed(2)}% Margin</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirement" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Requirement</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{data.requirement || "No requirement captured."}</p></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commercials" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Commercials</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-muted-foreground">Query Value</p><p className="font-bold">{inr(data.value)}</p></div>
              <div><p className="text-muted-foreground">Priority</p><Badge variant="outline">{data.priority}</Badge></div>
              <div><p className="text-muted-foreground">Owner</p><p className="font-medium">{data.owner}</p></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Assignment History</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {assignHistory.length === 0 && (
                <p className="text-sm text-muted-foreground">No assignment recorded yet.</p>
              )}
              {assignHistory.map((e, i) => (
                <div key={e.id} className="flex items-start gap-3 border-b pb-2 last:border-0">
                  <Badge variant={i === assignHistory.length - 1 ? "default" : "outline"} className="text-[10px] mt-0.5">
                    {i === assignHistory.length - 1 ? "Current" : `#${i + 1}`}
                  </Badge>
                  <div>
                    <p className="text-sm">
                      {e.assigned_from ? `${e.assigned_from} → ` : ""}<span className="font-medium">{e.assigned_to ?? data.owner}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtTime(e.at)} · assigned by {e.by}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Tasks</CardTitle>
                <NewTaskDialog queryId={data.query_id} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {queryTasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks for this query yet.</p>}
              {queryTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 border-b pb-2 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t.title}{t.done ? " ✓" : ""}</p>
                    <p className="text-xs text-muted-foreground">Due {fmtTime(t.due_at)} · Assigned to {t.owner}</p>
                  </div>
                  <OwnerSelect
                    className="w-[180px] h-8"
                    value={t.owner}
                    onChange={(name) => { reassignTask(t.id, name, actor); toast.success(`Task reassigned to ${name}`); }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Activity Log</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.activities.map((a) => (
                <div key={a.id} className="border-b pb-2 last:border-0">
                  <p className="text-sm">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{fmtTime(a.at)} · {a.by}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

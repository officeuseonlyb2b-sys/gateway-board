import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, Clock, AlertCircle, Users, FileText, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-mock";
import { toggleTask, useEmployees } from "@/lib/crm/store";
import { usePersonalMetrics } from "@/lib/crm/metrics";
import { fmtTime, inr } from "@/components/crm/ui";

export default function MyTasks() {
  const user = useAuth();
  const employees = useEmployees();
  const owner = employees.find((e) => e.email === user?.email)?.name ?? user?.name ?? employees[0]?.name ?? "";
  const m = usePersonalMetrics(owner);

  const pipelineTotal = m.pipeline.reduce((a, s) => a + s.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {owner || "there"} 🎉</h1>
          <p className="text-muted-foreground">Here's your work overview for today.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Today's Tasks</CardTitle>
              <Button variant="link" className="text-sm" asChild>
                <Link to="/query-tracker">View all tasks <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {m.todaysTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">No open tasks. Create a lead to get started.</p>
            )}
            {m.todaysTasks.map((task) => {
              const overdue = new Date(task.due_at).getTime() < m.today.getTime();
              return (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Checkbox
                    className="mt-1"
                    checked={task.done}
                    onCheckedChange={() => toggleTask(task.id)}
                    aria-label={`Complete ${task.title}`}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" /> {fmtTime(task.due_at)}
                      </Badge>
                      {task.note && <span className="text-xs text-muted-foreground">- {task.note}</span>}
                      {overdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">New Leads Assigned</p><p className="text-2xl font-bold">{m.newAssigned}</p></div><Users className="h-8 w-8 text-blue-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Quotations Pending</p><p className="text-2xl font-bold">{m.quotationsPending}</p></div><FileText className="h-8 w-8 text-yellow-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Follow-ups Due Today</p><p className="text-2xl font-bold">{m.followupsDueToday}</p></div><Clock className="h-8 w-8 text-orange-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Overdue Tasks</p><p className="text-2xl font-bold text-red-600">{m.overdueTasks}</p></div><AlertCircle className="h-8 w-8 text-red-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Tasks Completed Today</p><p className="text-2xl font-bold">{m.tasksCompletedToday}</p></div><CheckCircle className="h-8 w-8 text-green-500" /></div></CardContent></Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">My Pipeline by Stage</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {m.pipeline.map((stage) => (
              <div key={stage.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{stage.label}</span><span className="font-medium">{stage.count}</span>
                </div>
                <Progress value={pipelineTotal ? (stage.count / pipelineTotal) * 100 : 0} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Nurturing Leads</CardTitle>
              <Button variant="link" className="text-sm" asChild>
                <Link to="/query-tracker">View all <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.nurturing.length === 0 && <p className="text-sm text-muted-foreground">No nurturing leads.</p>}
            {m.nurturing.map((lead) => (
              <Link
                key={lead.id}
                to="/query/$queryId"
                params={{ queryId: lead.query_id }}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-medium">{lead.query_id} - {lead.customer}</p>
                  <p className="text-xs text-muted-foreground">Revisit on {fmtTime(lead.followup_due)}</p>
                </div>
                <Badge variant="secondary">{inr(lead.value)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button asChild><Link to="/new-lead">New Lead</Link></Button>
            <Button variant="outline" asChild><Link to="/costing" search={{ id: undefined }}>New Quotation</Link></Button>
            <Button variant="outline" asChild><Link to="/query-tracker">Query Tracker</Link></Button>
            <Button variant="outline" asChild><Link to="/reports">Reports</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

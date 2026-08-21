import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, AlertCircle, Users, FileText, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const tasks = [
  {
    title: "Follow-up Call with ABC Travels (QRY-2008-0187)",
    time: "04:30 PM",
    desc: "Quotation V2 sent",
    priority: "high",
  },
  {
    title: "Complete hotel costing (Gujarat Program) (QRY-2008-0180)",
    time: "05:00 PM",
    desc: "8 Pax Group",
    priority: "medium",
  },
  {
    title: "Review new requirement (QRY-2008-0191)",
    time: "06:00 PM",
    desc: "4 Pax Family",
    priority: "medium",
  },
  {
    title: "Check Taj Lakefront rate for client (QRY-2008-0187)",
    time: "Tomorrow 11:00 AM",
    desc: "",
    priority: "low",
  },
  {
    title: "Send revised quotation V3 (QRY-2008-0166)",
    time: "Tomorrow 03:00 PM",
    desc: "",
    priority: "medium",
  },
];

const nurturingLeads = [
  { id: "QRY-2608-0189", name: "Travel Arc", revisit: "25 Aug 2026", value: "₹ 78,000" },
  { id: "QRY-2608-0175", name: "Global Voyages", revisit: "30 Aug 2026", value: "₹ 1,350,000" },
  { id: "QRY-2608-0170", name: "Holiday Junction", revisit: "05 Sep 2026", value: "₹ 92,000" },
];

const pipelineStages = [
  { name: "New", count: 6 },
  { name: "Requirement Review", count: 4 },
  { name: "Costing", count: 7 },
  { name: "Quotation Sent", count: 8 },
  { name: "Follow-up", count: 4 },
  { name: "Nurturing", count: 3 },
];

export default function MyTasks() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, Rahul Sharma 🎉</h1>
          <p className="text-muted-foreground">Here's your work overview for today.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Today's Tasks</CardTitle>
              <Button variant="link" className="text-sm">
                View all tasks <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasks.map((task, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="mt-1"><CheckCircle className="h-4 w-4 text-muted-foreground" /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" /> {task.time}
                    </Badge>
                    {task.desc && <span className="text-xs text-muted-foreground">- {task.desc}</span>}
                    {task.priority === "high" && <Badge variant="destructive" className="text-xs">High Priority</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">New Leads Assigned</p><p className="text-2xl font-bold">28</p></div><Users className="h-8 w-8 text-blue-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Quotations Pending</p><p className="text-2xl font-bold">7</p></div><FileText className="h-8 w-8 text-yellow-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Follow-ups Due Today</p><p className="text-2xl font-bold">9</p></div><Clock className="h-8 w-8 text-orange-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Overdue Tasks</p><p className="text-2xl font-bold text-red-600">3</p></div><AlertCircle className="h-8 w-8 text-red-500" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Tasks Completed Today</p><p className="text-2xl font-bold">12</p></div><CheckCircle className="h-8 w-8 text-green-500" /></div><p className="text-xs text-muted-foreground mt-1">Due Today: None</p></CardContent></Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">My Pipeline by Stage</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {pipelineStages.map((stage) => (
              <div key={stage.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{stage.name}</span><span className="font-medium">{stage.count}</span>
                </div>
                <Progress value={(stage.count / pipelineStages.reduce((acc, s) => acc + s.count, 0)) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Nurturing Leads</CardTitle>
              <Button variant="link" className="text-sm">View all <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {nurturingLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div><p className="text-sm font-medium">{lead.id} - {lead.name}</p><p className="text-xs text-muted-foreground">Revisit on {lead.revisit}</p></div>
                <Badge variant="secondary">{lead.value}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button>New Lead</Button>
            <Button variant="outline">New Quotation</Button>
            <Button variant="outline">My Tasks</Button>
            <Button variant="outline">Query Tracker</Button>
            <Button variant="outline">Reports</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
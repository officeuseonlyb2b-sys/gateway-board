// src/pages/admin/tasks.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrmTasks, useEmployees } from "@/lib/crm/store";
import { useState } from "react";
import { Clock, CheckCircle, AlertCircle, User, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

export default function AdminTasks() {
  const allTasks = useCrmTasks();
  const employees = useEmployees();

  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "done">("all");

  const filtered = allTasks.filter((task) => {
    if (filterEmployee !== "all" && task.owner !== filterEmployee) return false;
    if (filterStatus === "pending" && task.done) return false;
    if (filterStatus === "done" && !task.done) return false;
    return true;
  });

  // Sort by due date (soonest first)
  const sorted = [...filtered].sort(
    (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  );

  // Stats
  const total = allTasks.length;
  const pendingCount = allTasks.filter((t) => !t.done).length;
  const overdueCount = allTasks.filter(
    (t) => !t.done && new Date(t.due_at).getTime() < Date.now()
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin – All Tasks</h1>
          <p className="text-muted-foreground">Monitor and manage all employee tasks with daily updates.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="outline">Total: {total}</Badge>
          <Badge variant="secondary">Pending: {pendingCount}</Badge>
          <Badge variant="destructive">Overdue: {overdueCount}</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by employee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((emp) => (
              <SelectItem key={emp.name} value={emp.name}>
                {emp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterStatus}
          onValueChange={(val) => setFilterStatus(val as typeof filterStatus)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="done">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" asChild>
          <Link to="/reports/tasks">Export Report</Link>
        </Button>
      </div>

      {/* Task Cards */}
      <div className="grid grid-cols-1 gap-4">
        {sorted.length === 0 ? (
          <p className="text-muted-foreground">No tasks match the current filters.</p>
        ) : (
          sorted.map((task) => {
            const isOverdue =
              !task.done && new Date(task.due_at).getTime() < Date.now();
            return (
              <Card key={task.id} className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{task.title}</h3>
                        <Badge variant={task.done ? "secondary" : "default"}>
                          {task.done ? "Done" : "Pending"}
                        </Badge>
                        {isOverdue && (
                          <Badge variant="destructive">Overdue</Badge>
                        )}
                        {task.query_id && (
                          <Badge variant="outline" className="text-xs">
                            Query: {task.query_id}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span>
                          <User className="inline h-4 w-4 mr-1" />
                          {task.owner}
                        </span>
                        <span>
                          <Clock className="inline h-4 w-4 mr-1" />
                          Due: {new Date(task.due_at).toLocaleDateString()}
                        </span>
                        {task.assigned_by && (
                          <span>Assigned by: {task.assigned_by}</span>
                        )}
                        {task.completed_at && (
                          <span>
                            <CheckCircle className="inline h-4 w-4 mr-1 text-green-500" />
                            Completed: {new Date(task.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* Show all updates */}
                      {task.updates && task.updates.length > 0 && (
                        <div className="mt-3 bg-muted/30 p-2 rounded-md">
                          <p className="text-xs font-medium mb-1">
                            Progress Updates ({task.updates.length})
                          </p>
                          <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                            {task.updates.map((u, idx) => (
                              <div key={idx} className="border-b border-muted/50 pb-1 last:border-0">
                                <span className="font-medium">
                                  {new Date(u.timestamp).toLocaleString()}
                                </span>
                                {u.by && <span className="text-muted-foreground"> ({u.by})</span>}
                                : {u.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button variant="outline" size="sm">Edit</Button>
                      <Button variant="outline" size="sm">Reassign</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
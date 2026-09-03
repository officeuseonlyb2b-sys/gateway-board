// src/pages/my-tasks.tsx

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2,
  Clock3,
  AlertCircle,
  Edit3,
  ArrowRight,
  ListTodo,
  CalendarDays,
  Users,
  Search,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-mock";
import {
  useCrmTasks,
  useEmployees,
  toggleTask,
  reassignTask,
  addTaskUpdate,
  addTask,
} from "@/lib/crm/store";
import { NewTaskDialog, OwnerSelect } from "@/components/crm/assign";
import { toast } from "sonner";
import { useMemo, useState } from "react";

export default function MyTasks() {
  const user = useAuth();
  const allTasks = useCrmTasks();
  const employees = useEmployees();

  const owner =
    employees.find((e) => e.email === user?.email)?.name ??
    user?.name ??
    "";

  const isAdmin =
    owner === "Enchanting MP" || user?.role === "admin";

  /**
   * ADMIN:
   * Show all tasks.
   *
   * NORMAL USER:
   * Show only tasks assigned to current user.
   */
  const visibleTasks = useMemo(() => {
    if (isAdmin) return allTasks;

    return allTasks.filter((task) => task.owner === owner);
  }, [allTasks, isAdmin, owner]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pendingTasks = useMemo(
    () => visibleTasks.filter((task) => !task.done),
    [visibleTasks]
  );

  const completedTasks = useMemo(
    () => visibleTasks.filter((task) => task.done),
    [visibleTasks]
  );

  const overdueTasks = useMemo(() => {
    return pendingTasks.filter(
      (task) =>
        new Date(task.due_at).getTime() < today.getTime()
    );
  }, [pendingTasks]);

  const completedToday = useMemo(() => {
    return visibleTasks.filter(
      (task) =>
        task.done &&
        task.completed_at &&
        new Date(task.completed_at).toDateString() ===
          today.toDateString()
    );
  }, [visibleTasks]);

  const [updatingTaskId, setUpdatingTaskId] =
    useState<string | null>(null);

  const [updateText, setUpdateText] = useState("");

  const [search, setSearch] = useState("");

  /**
   * Search pending tasks on dashboard.
   */
  const filteredPendingTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return pendingTasks;

    return pendingTasks.filter((task) => {
      return (
        task.title?.toLowerCase().includes(query) ||
        task.note?.toLowerCase().includes(query) ||
        task.owner?.toLowerCase().includes(query) ||
        task.assigned_by?.toLowerCase().includes(query)
      );
    });
  }, [pendingTasks, search]);

  const handleUpdateSubmit = (taskId: string) => {
    const text = updateText.trim();

    if (!text) {
      toast.error("Please write something");
      return;
    }

    addTaskUpdate(taskId, text, owner);

    toast.success("Progress update saved");

    setUpdateText("");
    setUpdatingTaskId(null);
  };

  const handleToggleTask = (
    taskId: string,
    currentlyDone: boolean
  ) => {
    toggleTask(taskId);

    toast.success(
      currentlyDone
        ? "Task moved back to pending"
        : "Task completed successfully"
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-7 pb-8">
      {/* =========================================================
          PAGE HEADER
      ========================================================== */}
      <div className="rounded-2xl border bg-gradient-to-r from-background via-background to-muted/40 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <ListTodo className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  Task Management
                </p>

                <h1 className="truncate text-2xl font-bold tracking-tight">
                  Welcome back, {owner || "there"} 👋
                </h1>

                <p className="mt-1 text-sm text-muted-foreground">
                  {isAdmin
                    ? "Manage and monitor all team tasks from one place."
                    : "Stay on top of your assigned tasks and daily follow-ups."}
                </p>
              </div>
            </div>
          </div>

          <NewTaskDialog
            trigger={
              <Button className="h-10 px-5 shadow-sm">
                <ListTodo className="mr-2 h-4 w-4" />
                Assign New Task
              </Button>
            }
            onAssign={(taskData) => {
              addTask(taskData, owner);
              toast.success("Task assigned successfully");
            }}
          />
        </div>
      </div>

      {/* =========================================================
          KPI CARDS
      ========================================================== */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Pending */}
        <Card className="overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  Pending Tasks
                </p>

                <p className="mt-1 text-3xl font-bold">
                  {pendingTasks.length}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Tasks waiting for completion
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Clock3 className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Completed Today */}
        <Card className="overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  Completed Today
                </p>

                <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-500">
                  {completedToday.length}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Finished today
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card className="overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  Overdue
                </p>

                <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-500">
                  {overdueTasks.length}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Needs immediate attention
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <AlertCircle className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total */}
        <Card className="overflow-hidden border-border/60 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  Total Tasks
                </p>

                <p className="mt-1 text-3xl font-bold">
                  {visibleTasks.length}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {completedTasks.length} completed overall
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* =========================================================
          PENDING TASKS
      ========================================================== */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="border-b bg-muted/20 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-lg">
                My Tasks
              </CardTitle>

              <p className="mt-1 text-sm text-muted-foreground">
                {pendingTasks.length > 0
                  ? `${pendingTasks.length} pending task${
                      pendingTasks.length === 1 ? "" : "s"
                    } requiring attention`
                  : "You have no pending tasks"}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tasks..."
                  className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-primary/20 sm:w-[220px]"
                />
              </div>

              {/* IMPORTANT:
                  This now navigates to the actual All Tasks route.
              */}
              <Button
                size="sm"
                variant="outline"
                className="h-9 whitespace-nowrap"
                asChild
              >
                <Link to="/tasks/all">
                  View all tasks
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {filteredPendingTasks.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
              </div>

              <h3 className="text-base font-semibold">
                {search
                  ? "No matching tasks found"
                  : "No pending tasks"}
              </h3>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {search
                  ? "Try changing your search keyword."
                  : "Everything is under control. Great job! 🎉"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPendingTasks.map((task) => {
                const isOverdue =
                  new Date(task.due_at).getTime() <
                  today.getTime();

                const isUpdating =
                  updatingTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className={[
                      "group rounded-xl border p-4 transition-all duration-200",
                      "hover:border-primary/30 hover:bg-muted/20 hover:shadow-sm",
                      isOverdue
                        ? "border-red-200 dark:border-red-900/50"
                        : "",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                      {/* Main task */}
                      <div className="flex min-w-0 flex-1 gap-3">
                        <Checkbox
                          className="mt-1 shrink-0"
                          checked={task.done}
                          onCheckedChange={() =>
                            handleToggleTask(
                              task.id,
                              task.done
                            )
                          }
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold leading-tight">
                              {task.title}
                            </h3>

                            {isOverdue && (
                              <Badge
                                variant="destructive"
                                className="gap-1"
                              >
                                <AlertCircle className="h-3 w-3" />
                                Overdue
                              </Badge>
                            )}
                          </div>

                          {/* Metadata */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="gap-1 font-normal"
                            >
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(task.due_at)}
                            </Badge>

                            {task.owner && (
                              <Badge
                                variant="secondary"
                                className="font-normal"
                              >
                                Assigned to: {task.owner}
                              </Badge>
                            )}

                            {task.assigned_by &&
                              task.assigned_by !== task.owner && (
                                <span className="text-xs text-muted-foreground">
                                  Assigned by{" "}
                                  <span className="font-medium text-foreground">
                                    {task.assigned_by}
                                  </span>
                                </span>
                              )}
                          </div>

                          {/* Note */}
                          {task.note && (
                            <p className="mt-2 text-sm leading-5 text-muted-foreground">
                              {task.note}
                            </p>
                          )}

                          {/* Update */}
                          {isUpdating ? (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <input
                                type="text"
                                autoFocus
                                placeholder="Write progress update..."
                                value={updateText}
                                onChange={(e) =>
                                  setUpdateText(
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleUpdateSubmit(
                                      task.id
                                    );
                                  }

                                  if (e.key === "Escape") {
                                    setUpdatingTaskId(null);
                                    setUpdateText("");
                                  }
                                }}
                                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                              />

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-9"
                                  onClick={() =>
                                    handleUpdateSubmit(
                                      task.id
                                    )
                                  }
                                >
                                  Save
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9"
                                  onClick={() => {
                                    setUpdatingTaskId(null);
                                    setUpdateText("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setUpdatingTaskId(task.id)
                              }
                            >
                              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                              Add Progress Update
                            </Button>
                          )}

                          {/* Updates */}
                          {task.updates &&
                            task.updates.length > 0 && (
                              <div className="mt-3 border-l-2 pl-3">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Recent Updates
                                </p>

                                <div className="space-y-1.5">
                                  {task.updates.map(
                                    (update, index) => (
                                      <div
                                        key={index}
                                        className="text-xs leading-5 text-muted-foreground"
                                      >
                                        <span className="font-medium text-foreground">
                                          {update.by ||
                                            "User"}
                                        </span>{" "}
                                        ·{" "}
                                        {formatDateTime(
                                          update.timestamp
                                        )}{" "}
                                        — {update.text}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      </div>

                      {/* Owner */}
                      <div className="w-full shrink-0 xl:w-[190px]">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                          Task Owner
                        </p>

                        <OwnerSelect
                          className="h-9 w-full"
                          value={task.owner}
                          onChange={(name) => {
                            reassignTask(
                              task.id,
                              name,
                              owner
                            );

                            toast.success(
                              `Task reassigned to ${name}`
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================
          QUICK ACTIONS
      ========================================================== */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Quick Actions
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <NewTaskDialog
              trigger={
                <Button className="h-10 w-full">
                  <ListTodo className="mr-2 h-4 w-4" />
                  New Task
                </Button>
              }
              onAssign={(taskData) => {
                addTask(taskData, owner);
                toast.success("Task assigned successfully");
              }}
            />

            {/* Actual route */}
            <Button
              variant="outline"
              className="h-10 w-full"
              asChild
            >
              <Link to="/tasks/all">
                <ArrowRight className="mr-2 h-4 w-4" />
                All Tasks
              </Link>
            </Button>

            {/* Existing route */}
            <Button
              variant="outline"
              className="h-10 w-full"
              asChild
            >
              <Link to="/tasks/calendar">
                <CalendarDays className="mr-2 h-4 w-4" />
                Calendar View
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
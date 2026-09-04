// src/routes/tasks/all.tsx

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
  ArrowLeft,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Edit3,
  ListTodo,
  Search,
  User,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  useCrmTasks,
  useEmployees,
  toggleTask,
  reassignTask,
  addTaskUpdate,
  addTask,
} from "@/lib/crm/store";
import { useAuth } from "@/lib/auth-mock";
import {
  NewTaskDialog,
  OwnerSelect,
} from "@/components/crm/assign";
import { toast } from "sonner";
import { useMemo, useState } from "react";

type StatusFilter =
  | "all"
  | "pending"
  | "completed"
  | "overdue";

export default function AllTasks() {
  const user = useAuth();
  const allTasks = useCrmTasks();
  const employees = useEmployees();

  const owner =
    employees.find((e) => e.email === user?.email)?.name ??
    user?.name ??
    "";

  const isAdmin =
    owner === "Enchanting MP" || user?.role === "admin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [updatingTaskId, setUpdatingTaskId] =
    useState<string | null>(null);

  const [updateText, setUpdateText] = useState("");

  const [sortAsc, setSortAsc] = useState(true);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /**
   * Task counts
   */
  const stats = useMemo(() => {
    const pending = allTasks.filter(
      (task) => !task.done
    );

    const completed = allTasks.filter(
      (task) => task.done
    );

    const overdue = pending.filter(
      (task) =>
        new Date(task.due_at).getTime() <
        today.getTime()
    );

    return {
      total: allTasks.length,
      pending: pending.length,
      completed: completed.length,
      overdue: overdue.length,
    };
  }, [allTasks, today]);

  /**
   * Filter + sort
   */
  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    let tasks = [...allTasks];

    if (statusFilter === "pending") {
      tasks = tasks.filter((task) => !task.done);
    }

    if (statusFilter === "completed") {
      tasks = tasks.filter((task) => task.done);
    }

    if (statusFilter === "overdue") {
      tasks = tasks.filter(
        (task) =>
          !task.done &&
          new Date(task.due_at).getTime() <
            today.getTime()
      );
    }

    if (query) {
      tasks = tasks.filter((task) => {
        return (
          task.title?.toLowerCase().includes(query) ||
          task.note?.toLowerCase().includes(query) ||
          task.owner?.toLowerCase().includes(query) ||
          task.assigned_by
            ?.toLowerCase()
            .includes(query) ||
          task.query_id
            ?.toLowerCase()
            .includes(query)
        );
      });
    }

    tasks.sort((a, b) => {
      const first =
        new Date(a.due_at).getTime();

      const second =
        new Date(b.due_at).getTime();

      return sortAsc
        ? first - second
        : second - first;
    });

    return tasks;
  }, [
    allTasks,
    search,
    statusFilter,
    sortAsc,
    today,
  ]);

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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-7 pb-8">
      {/* =========================================================
          HEADER
      ========================================================== */}
      <div className="rounded-2xl border bg-gradient-to-r from-background via-background to-muted/40 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ListTodo className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Task Management
              </p>

              <h1 className="text-2xl font-bold tracking-tight">
                All Tasks
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                View, manage and track all assigned tasks.
                {isAdmin
                  ? " Admin view — showing the complete task list."
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <NewTaskDialog
              trigger={
                <Button className="h-10">
                  <ListTodo className="mr-2 h-4 w-4" />
                  New Task
                </Button>
              }
            />

            <Button
              asChild
              variant="outline"
              className="h-10"
            >
              <Link to="/my-tasks">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to My Tasks
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================================
          STATISTICS
      ========================================================== */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total */}
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className="text-left"
        >
          <Card
            className={[
              "h-full border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              statusFilter === "all"
                ? "ring-2 ring-primary/20"
                : "",
            ].join(" ")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Tasks
                  </p>

                  <p className="mt-1 text-3xl font-bold">
                    {stats.total}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Complete task list
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                  <ListTodo className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Pending */}
        <button
          type="button"
          onClick={() => setStatusFilter("pending")}
          className="text-left"
        >
          <Card
            className={[
              "h-full border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              statusFilter === "pending"
                ? "ring-2 ring-primary/20"
                : "",
            ].join(" ")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Pending
                  </p>

                  <p className="mt-1 text-3xl font-bold">
                    {stats.pending}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Awaiting completion
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <Clock3 className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Completed */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter("completed")
          }
          className="text-left"
        >
          <Card
            className={[
              "h-full border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              statusFilter === "completed"
                ? "ring-2 ring-primary/20"
                : "",
            ].join(" ")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Completed
                  </p>

                  <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-500">
                    {stats.completed}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Finished tasks
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Overdue */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter("overdue")
          }
          className="text-left"
        >
          <Card
            className={[
              "h-full border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              statusFilter === "overdue"
                ? "ring-2 ring-red-500/20"
                : "",
            ].join(" ")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Overdue
                  </p>

                  <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-500">
                    {stats.overdue}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Needs attention
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  <AlertCircle className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* =========================================================
          TASK LIST
      ========================================================== */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="border-b bg-muted/20 px-5 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <CardTitle className="text-lg">
                  Task Directory
                </CardTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  Showing {filteredTasks.length} of{" "}
                  {allTasks.length} tasks
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {/* Search */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <input
                    value={search}
                    onChange={(e) =>
                      setSearch(e.target.value)
                    }
                    placeholder="Search title, owner, query..."
                    className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-primary/20 sm:w-[270px]"
                  />
                </div>

                {/* Sort */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() =>
                    setSortAsc((value) => !value)
                  }
                >
                  <ArrowUpDown className="mr-2 h-4 w-4" />

                  {sortAsc
                    ? "Soonest First"
                    : "Latest First"}
                </Button>

                {/* Clear */}
                {(search ||
                  statusFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={clearFilters}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Status Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={
                  statusFilter === "all"
                    ? "default"
                    : "outline"
                }
                onClick={() =>
                  setStatusFilter("all")
                }
              >
                All ({stats.total})
              </Button>

              <Button
                size="sm"
                variant={
                  statusFilter === "pending"
                    ? "default"
                    : "outline"
                }
                onClick={() =>
                  setStatusFilter("pending")
                }
              >
                Pending ({stats.pending})
              </Button>

              <Button
                size="sm"
                variant={
                  statusFilter === "completed"
                    ? "default"
                    : "outline"
                }
                onClick={() =>
                  setStatusFilter("completed")
                }
              >
                Completed ({stats.completed})
              </Button>

              <Button
                size="sm"
                variant={
                  statusFilter === "overdue"
                    ? "destructive"
                    : "outline"
                }
                onClick={() =>
                  setStatusFilter("overdue")
                }
              >
                Overdue ({stats.overdue})
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {filteredTasks.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Search className="h-7 w-7 text-muted-foreground" />
              </div>

              <h3 className="text-base font-semibold">
                No tasks found
              </h3>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                There are no tasks matching the current
                search or filter.
              </p>

              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearFilters}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const isOverdue =
                  !task.done &&
                  new Date(task.due_at).getTime() <
                    today.getTime();

                const isUpdating =
                  updatingTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className={[
                      "rounded-xl border p-4 transition-all duration-200",
                      "hover:bg-muted/20 hover:shadow-sm",
                      task.done
                        ? "bg-muted/10 opacity-80"
                        : "bg-background",
                      isOverdue
                        ? "border-red-200 dark:border-red-900/50"
                        : "",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                      {/* Checkbox + Main */}
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
                          {/* Title */}
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              className={[
                                "font-semibold leading-tight",
                                task.done
                                  ? "text-muted-foreground line-through"
                                  : "",
                              ].join(" ")}
                            >
                              {task.title}
                            </h3>

                            <Badge
                              variant={
                                task.done
                                  ? "secondary"
                                  : "default"
                              }
                            >
                              {task.done
                                ? "Completed"
                                : "Pending"}
                            </Badge>

                            {isOverdue && (
                              <Badge
                                variant="destructive"
                                className="gap-1"
                              >
                                <AlertCircle className="h-3 w-3" />
                                Overdue
                              </Badge>
                            )}

                            {task.query_id && (
                              <Badge
                                variant="outline"
                                className="text-xs"
                              >
                                Query: {task.query_id}
                              </Badge>
                            )}
                          </div>

                          {/* Details */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              <span className="font-medium text-foreground">
                                {task.owner}
                              </span>
                            </span>

                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              Due:{" "}
                              <span className="font-medium text-foreground">
                                {formatDate(
                                  task.due_at
                                )}
                              </span>
                            </span>

                            {task.assigned_by && (
                              <span>
                                Assigned by:{" "}
                                <span className="font-medium text-foreground">
                                  {task.assigned_by}
                                </span>
                              </span>
                            )}

                            {task.completed_at && (
                              <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-500">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Completed:{" "}
                                {formatDate(
                                  task.completed_at
                                )}
                              </span>
                            )}
                          </div>

                          {/* Note */}
                          {task.note && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {task.note}
                            </p>
                          )}

                          {/* Update Input */}
                          {isUpdating ? (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <input
                                type="text"
                                autoFocus
                                value={updateText}
                                placeholder="Write progress update..."
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
                                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
                                  size="sm"
                                  variant="ghost"
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
                            !task.done && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setUpdatingTaskId(
                                    task.id
                                  )
                                }
                              >
                                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                                Add Progress Update
                              </Button>
                            )
                          )}

                          {/* Progress Updates */}
                          {task.updates &&
                            task.updates.length > 0 && (
                              <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-xs font-semibold">
                                    Progress Updates
                                  </p>

                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {task.updates.length}
                                  </Badge>
                                </div>

                                <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                                  {task.updates.map(
                                    (update, index) => (
                                      <div
                                        key={index}
                                        className="rounded-md border bg-background p-2"
                                      >
                                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                                          <span className="font-medium text-foreground">
                                            {update.by ||
                                              "User"}
                                          </span>

                                          <span className="text-muted-foreground">
                                            •
                                          </span>

                                          <span className="text-muted-foreground">
                                            {formatDateTime(
                                              update.timestamp
                                            )}
                                          </span>
                                        </div>

                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                          {update.text}
                                        </p>
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
          BOTTOM NAVIGATION
      ========================================================== */}
      <div className="flex justify-start">
        <Button variant="outline" asChild>
          <Link to="/my-tasks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to My Tasks
          </Link>
        </Button>
      </div>
    </div>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCrmTasks } from "@/lib/crm/store";

export const Route = createFileRoute("/_authenticated/tasks/calendar")({
  head: () => ({
    meta: [
      { title: "Task Calendar — MP Tourism Hub" },
      { name: "description", content: "Team tasks grouped by due date in a simple day-by-day calendar view." },
      { property: "og:title", content: "Task Calendar — MP Tourism Hub" },
      { property: "og:description", content: "Team tasks grouped by due date in a simple day-by-day calendar view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaskCalendar,
});

function TaskCalendar() {
  const tasks = useCrmTasks();

  const days = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const key = (t.due_at || "").slice(0, 10) || "No date";
      map.set(key, [...(map.get(key) || []), t]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [tasks]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Task Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tasks grouped by their due date.</p>
        </div>
        <Link to="/my-tasks" className="text-sm font-medium text-primary hover:underline">
          Back to My Tasks
        </Link>
      </div>

      {days.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No tasks scheduled yet.</Card>
      ) : (
        <div className="space-y-4">
          {days.map(([day, list]) => (
            <Card key={day} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  {day === "No date"
                    ? "No date"
                    : new Date(day + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>
              <ul className="space-y-1.5">
                {list.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span className={t.done ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                    <span className="text-xs text-muted-foreground">{t.owner || "Unassigned"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

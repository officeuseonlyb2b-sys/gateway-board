import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, KanbanSquare } from "lucide-react";
import { QueryFilters, useQueryFilters } from "@/components/crm/query-filters";
import { inr, paxRangeLabel } from "@/components/crm/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAccessibleQueries } from "@/lib/crm/access";
import { STAGES } from "@/lib/crm/types";

const COLORS: Record<string, string> = {
  New: "border-sky-300",
  "Requirement Review": "border-indigo-300",
  Costing: "border-amber-300",
  "Quotation Sent": "border-blue-300",
  "Follow-up": "border-violet-300",
  Nurturing: "border-orange-300",
  Won: "border-emerald-300",
  Lost: "border-red-300",
};

export default function PipelineBoard() {
  const navigate = useNavigate();
  const queries = useAccessibleQueries();
  const scope = useQueryFilters(queries);
  return (
    <div className="mx-auto max-w-[1900px] space-y-6 p-6">
      <div>
        <p className="text-sm font-medium text-teal-700">MP Unit · Sales lifecycle</p>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <KanbanSquare className="h-7 w-7" />
          Pipeline Board
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          One Query truth arranged by the approved Sales stages. Isolate a period, advisor, partner
          or scenario below.
        </p>
      </div>
      <QueryFilters
        state={scope.filters}
        onChange={scope.setFilters}
        options={scope.options}
        onReset={scope.reset}
      />
      <div className="flex gap-4 overflow-x-auto pb-5">
        {STAGES.map((stage) => {
          const items = scope.filtered.filter((query) => query.stage === stage);
          const value = items.reduce(
            (sum, query) => sum + (query.commercials.top_line || query.value || 0),
            0,
          );
          return (
            <section
              key={stage}
              className={`min-w-[310px] flex-1 rounded-xl border border-t-4 bg-slate-100/80 p-3 ${COLORS[stage]}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{stage}</h2>
                  <p className="text-xs text-slate-500">{inr(value)} opportunity</p>
                </div>
                <Badge className="bg-white text-slate-900">{items.length}</Badge>
              </div>
              <div className="space-y-3">
                {items.map((query) => (
                  <Card
                    key={query.id}
                    className="cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
                    onClick={() => navigate({ to: "/queries/$id", params: { id: query.id } })}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between">
                        <p className="font-bold text-teal-700">{query.query_id}</p>
                        <Badge variant="outline">{query.priority}</Badge>
                      </div>
                      <p className="mt-1 font-semibold">{query.customer}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {query.program_name || query.destination}
                      </p>
                      <div className="mt-4 flex justify-between text-sm">
                        <span>
                          {paxRangeLabel(query)}
                        </span>
                        <strong>{inr(query.commercials.top_line || query.value || 0)}</strong>
                      </div>
                      <div className="mt-3 flex justify-between border-t pt-2 text-xs text-slate-500">
                        <span>{query.owner || "Unassigned"}</span>
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-white/60 p-8 text-center text-sm text-slate-500">
                    No Queries
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <Button variant="outline" onClick={() => navigate({ to: "/queries/assignment-desk" })}>
        Open Assignment Desk
      </Button>
    </div>
  );
}

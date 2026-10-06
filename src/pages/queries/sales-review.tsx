import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAccessibleQueries, useAccessProfile } from "@/lib/crm/access";

export type ReviewMode = "query" | "quotation" | "assistance";

export default function SalesReview({ mode }: { mode: ReviewMode }) {
  const access = useAccessProfile();
  const employeeId = access.employee?.id;
  const accessible = useAccessibleQueries();
  const list = accessible.filter((query) => {
    if (access.canManageTeam) {
      if (mode === "query") return Boolean(query.reviewer_employee_ids?.length);
      if (mode === "assistance") return Boolean(query.assistance_employee_ids?.length);
      return Boolean(query.reviewer_employee_ids?.length && query.costing_versions?.length);
    }
    if (mode === "query")
      return Boolean(employeeId && query.reviewer_employee_ids?.includes(employeeId));
    if (mode === "assistance")
      return Boolean(employeeId && query.assistance_employee_ids?.includes(employeeId));
    return Boolean(
      employeeId &&
      query.reviewer_employee_ids?.includes(employeeId) &&
      query.costing_versions?.length,
    );
  });
  const title =
    mode === "query"
      ? "Queries for Review"
      : mode === "quotation"
        ? "Quotations for Review"
        : "Assisted Queries";
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6 lg:p-8">
      <div>
        <p className="text-sm font-medium text-teal-700">Explicit review & support access</p>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only Queries explicitly shared for this purpose appear here; Senior access is not a
          blanket team view.
        </p>
      </div>
      <div className="space-y-3">
        {list.map((query) => (
          <Card key={query.id}>
            <CardContent className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/queries/$id"
                    params={{ id: query.id }}
                    className="font-bold text-teal-700 hover:underline"
                  >
                    {query.query_id}
                  </Link>
                  <Badge variant="outline">{query.stage}</Badge>
                </div>
                <p className="mt-1 font-semibold">{query.customer}</p>
                <p className="text-sm text-slate-500">
                  {query.program_name || query.destination} · Owner {query.owner || "Unassigned"}
                </p>
              </div>
              <Link
                to="/queries/$id"
                params={{ id: query.id }}
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Open Query
              </Link>
            </CardContent>
          </Card>
        ))}
        {!list.length && (
          <Card>
            <CardContent className="p-10 text-center text-slate-500">
              No explicitly assigned records in this queue.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

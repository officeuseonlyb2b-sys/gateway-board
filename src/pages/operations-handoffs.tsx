import { CheckCircle2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptOperationsHandoff, useCrmQueries } from "@/lib/crm/store";
import { useActor } from "@/components/crm/assign";
import { useAccessProfile } from "@/lib/crm/access";

export default function OperationsHandoffs() {
  const actor = useActor();
  const access = useAccessProfile();
  const queries = useCrmQueries()
    .filter(
      (query) =>
        query.stage === "Won" &&
        query.operations_handoff &&
        (access.role === "Administrator" ||
          access.role === "Owner / Director" ||
          (query.primary_unit || "Madhya Pradesh") === access.unit),
    )
    .sort((a, b) =>
      (b.operations_handoff?.created_at || "").localeCompare(
        a.operations_handoff?.created_at || "",
      ),
    );
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <div>
        <p className="text-sm font-medium text-teal-700">Minimal Phase-1 bridge</p>
        <h1 className="text-3xl font-bold">Operations Handoff</h1>
        <p className="text-sm text-slate-500">
          Won Queries awaiting acknowledgement. Full Operations workflows remain outside this phase.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Awaiting acceptance</p>
            <p className="text-3xl font-bold">
              {
                queries.filter(
                  (query) => query.operations_handoff?.status === "Awaiting Operations Acceptance",
                ).length
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Accepted</p>
            <p className="text-3xl font-bold">
              {queries.filter((query) => query.operations_handoff?.status === "Accepted").length}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Won Query Intake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {queries.map((query) => (
            <div
              key={query.id}
              className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <p className="font-bold text-teal-700">{query.query_id}</p>
                <p className="font-semibold">{query.customer}</p>
              </div>
              <div>
                <p>{query.program_name || query.destination}</p>
                <p className="text-xs text-slate-500">
                  {query.pax} pax · {query.travel_start}
                </p>
              </div>
              <div>
                <p className="font-semibold">{query.operations_handoff?.status}</p>
                <p className="text-xs text-slate-500">
                  Created {new Date(query.operations_handoff!.created_at).toLocaleString("en-GB")}
                </p>
              </div>
              {query.operations_handoff?.status === "Accepted" ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              ) : (
                <Button
                  onClick={() => {
                    acceptOperationsHandoff(query.query_id, actor);
                    toast.success("Operations handoff accepted");
                  }}
                >
                  <PackageCheck className="mr-2 h-4 w-4" />
                  Accept
                </Button>
              )}
            </div>
          ))}
          {!queries.length && (
            <p className="p-8 text-center text-slate-500">
              No Won Queries are waiting for Operations.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

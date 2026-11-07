import { useMemo } from "react";
import { BarChart3, IndianRupee, MapPinned, Route, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessibleQueries } from "@/lib/crm/access";
import { programMetrics, programMoney } from "@/lib/crm/program-insights";
import { usePrograms } from "@/lib/wizard/agents-store";

export default function ProgramsPage() {
  const programs = usePrograms();
  const queries = useAccessibleQueries();

  const rows = useMemo(
    () =>
      programs.map((program) => ({
        program,
        metrics: programMetrics(program, queries),
      })),
    [programs, queries],
  );

  const totals = useMemo(
    () => ({
      used: rows.filter(({ metrics }) => metrics.linked.length).length,
      won: rows.reduce((sum, { metrics }) => sum + metrics.won.length, 0),
      wonValue: rows.reduce((sum, { metrics }) => sum + metrics.wonValue, 0),
      openValue: rows.reduce((sum, { metrics }) => sum + metrics.openValue, 0),
      lostValue: rows.reduce((sum, { metrics }) => sum + metrics.lostValue, 0),
    }),
    [rows],
  );

  const destinationRows = useMemo(() => {
    const map = new Map<
      string,
      { programs: Set<string>; queries: Set<string>; won: Set<string>; wonValue: number }
    >();
    for (const { program, metrics } of rows) {
      for (const city of program.cities) {
        const item = map.get(city) || {
          programs: new Set(),
          queries: new Set(),
          won: new Set(),
          wonValue: 0,
        };
        item.programs.add(program.id);
        metrics.linked.forEach((query) => item.queries.add(query.id));
        metrics.won.forEach((query) => item.won.add(query.id));
        item.wonValue += metrics.wonValue;
        map.set(city, item);
      }
    }
    return [...map.entries()]
      .map(([city, item]) => ({ city, ...item }))
      .sort((a, b) => b.wonValue - a.wonValue || b.queries.size - a.queries.size)
      .slice(0, 10);
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-teal-700">Product intelligence · MP Unit</p>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Route className="h-7 w-7 text-teal-600" /> Routing & Programs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregate programme, query, business and destination performance.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {(
          [
            ["Programme count", programs.length, Route],
            ["Used in Queries", totals.used, BarChart3],
            ["Won Queries", totals.won, Trophy],
            ["Business generated", programMoney(totals.wonValue), IndianRupee],
            ["Open opportunity", programMoney(totals.openValue), IndianRupee],
            ["Lost quoted value", programMoney(totals.lostValue), IndianRupee],
          ] satisfies Array<[string, string | number, LucideIcon]>
        ).map(([label, value, Icon]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{label as string}</p>
                <p className="mt-2 text-2xl font-bold">{value as string | number}</p>
              </div>
              <Icon className="h-5 w-5 text-teal-600" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="h-5 w-5 text-teal-600" /> Destination performance
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Top destinations by business won through linked programs.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {destinationRows.map((row, index) => (
                <div key={row.city} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {index + 1}. {row.city}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.programs.size} programs · {row.queries.size} Queries · {row.won.size}{" "}
                        won
                      </p>
                    </div>
                    <Badge variant="secondary">{programMoney(row.wonValue)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

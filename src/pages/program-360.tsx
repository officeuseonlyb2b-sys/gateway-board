import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  IndianRupee,
  MapPinned,
  Route,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccessibleQueries } from "@/lib/crm/access";
import { programMetrics, programMoney } from "@/lib/crm/program-insights";
import { queryLostValue, queryOpenValue, queryWonValue } from "@/lib/crm/relationship-insights";
import { usePrograms } from "@/lib/wizard/agents-store";

const dateLabel = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export default function Program360() {
  const { id } = useParams({ strict: false }) as { id: string };
  const program = usePrograms().find((item) => item.id === id || item.code === id);
  const allQueries = useAccessibleQueries();
  if (!program)
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-10 text-center">
            <h1 className="text-xl font-bold">Program not found</h1>
            <Button asChild className="mt-4">
              <Link to="/routing-programs">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Program Master
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  const metrics = programMetrics(program, allQueries);
  const conversionValue =
    metrics.wonValue + metrics.lostValue > 0
      ? (metrics.wonValue / (metrics.wonValue + metrics.lostValue)) * 100
      : 0;
  const monthMap = new Map<string, { queries: number; won: number; business: number }>();
  metrics.linked.forEach((query) => {
    const month = query.travel_start
      ? new Date(query.travel_start).toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        })
      : "Travel month not set";
    const current = monthMap.get(month) || { queries: 0, won: 0, business: 0 };
    current.queries += 1;
    if (query.stage === "Won") {
      current.won += 1;
      current.business += queryWonValue(query);
    }
    monthMap.set(month, current);
  });
  const months = [...monthMap.entries()]
    .sort((a, b) => b[1].business - a[1].business || b[1].queries - a[1].queries)
    .slice(0, 8);
  const lostReasons = [
    ...metrics.lost
      .reduce((map, query) => {
        const reason = query.lost_reason || "Reason not recorded";
        map.set(reason, (map.get(reason) || 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  ].sort((a, b) => b[1] - a[1]);
  const cards = [
    ["Total Queries", metrics.linked.length, Route],
    ["Open", metrics.open.length, Target],
    ["Won", metrics.won.length, Trophy],
    ["Lost", metrics.lost.length, XCircle],
    ["Won business", programMoney(metrics.wonValue), IndianRupee],
    ["Open opportunity", programMoney(metrics.openValue), IndianRupee],
    ["Lost quoted value", programMoney(metrics.lostValue), IndianRupee],
    ["Query conversion", `${metrics.conversion.toFixed(1)}%`, Trophy],
    ["Value conversion", `${conversionValue.toFixed(1)}%`, IndianRupee],
  ] as const;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link to="/routing-programs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Program Master
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-bold text-teal-700">{program.code}</p>
            <Badge variant={program.status === "Active" ? "default" : "secondary"}>
              {program.status}
            </Badge>
            <Badge variant="outline">{program.source}</Badge>
          </div>
          <h1 className="mt-1 text-3xl font-bold">{program.name}</h1>
          <p className="mt-2 max-w-4xl text-muted-foreground">
            {program.routing_summary || "Day-wise routing created in the Quotation Builder."}
          </p>
        </div>
        <div className="rounded-xl border bg-teal-50 px-5 py-4 text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Duration</p>
          <p className="text-2xl font-bold">
            {program.nights} Nights / {program.days} Days
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-teal-600" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Program itinerary</CardTitle>
            <p className="text-sm text-muted-foreground">
              Reusable itinerary structure without commercial rates.
            </p>
          </CardHeader>
          <CardContent>
            {program.routing.length ? (
              <div className="space-y-3">
                {program.routing.map((day) => (
                  <div
                    key={day.day}
                    className="grid gap-2 rounded-xl border p-4 md:grid-cols-[90px_180px_1fr]"
                  >
                    <div className="font-semibold text-teal-700">Day {day.day}</div>
                    <div>
                      <p className="text-xs text-muted-foreground">Overnight</p>
                      <p className="font-medium">{day.overnight_city || "Departure / no stay"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Program</p>
                      <p>{day.program_text || "Itinerary details to be completed"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6">
                <p className="font-semibold">Offline program routing</p>
                <p className="mt-2 text-muted-foreground">
                  {program.routing_summary || "Routing not available"}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  When this program is selected in the Quotation Builder, a {program.days}-day
                  editable routing is created. Saving a newly built routing stores its full day-wise
                  itinerary here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-teal-600" /> Destinations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {program.cities.length ? (
                  program.cities.map((city) => (
                    <Badge key={city} variant="secondary">
                      {city}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Cities can be refined when the routing is next used.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-teal-600" /> Travel-month performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {months.length ? (
                months.map(([month, item]) => (
                  <div
                    key={month}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{month}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.queries} Queries · {item.won} won
                      </p>
                    </div>
                    <Badge variant="outline">{programMoney(item.business)}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No linked travel history yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lost insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lostReasons.length ? (
                lostReasons.map(([reason, count]) => (
                  <div key={reason} className="flex justify-between rounded-lg border p-3 text-sm">
                    <span>{reason}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No lost Queries linked to this program.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Linked Query history</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every Query using this Program Code or Program Name.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Partner / Client</TableHead>
                  <TableHead>Travel</TableHead>
                  <TableHead>Advisor</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.linked
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((query) => {
                    const value =
                      query.stage === "Won"
                        ? queryWonValue(query)
                        : query.stage === "Lost"
                          ? queryLostValue(query)
                          : queryOpenValue(query);
                    return (
                      <TableRow key={query.id}>
                        <TableCell>
                          <Link
                            to="/queries/$id"
                            params={{ id: query.id }}
                            className="font-mono font-semibold text-teal-700"
                          >
                            {query.query_id}
                          </Link>
                        </TableCell>
                        <TableCell>{dateLabel(query.created_at)}</TableCell>
                        <TableCell>{query.customer}</TableCell>
                        <TableCell>{dateLabel(query.travel_start)}</TableCell>
                        <TableCell>{query.owner || "Awaiting assignment"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              query.stage === "Won"
                                ? "default"
                                : query.stage === "Lost"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {query.stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{programMoney(value)}</TableCell>
                      </TableRow>
                    );
                  })}
                {!metrics.linked.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No Queries are linked to this program yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

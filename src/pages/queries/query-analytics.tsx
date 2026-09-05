import { useMemo } from "react";
import {
  BarChart3,
  Clock3,
  DollarSign,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  useCrmMetrics,
} from "@/lib/crm/metrics";

function formatMoney(value: number) {
  const amount = Number(value) || 0;

  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  }

  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(1)} L`;
  }

  if (amount >= 1_000) {
    return `₹${(amount / 1_000).toFixed(1)} K`;
  }

  return `₹${amount.toLocaleString("en-IN")}`;
}

function hoursLabel(hours: number) {
  if (!hours) return "—";

  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }

  if (hours < 24) {
    return `${hours.toFixed(1)} hrs`;
  }

  return `${(hours / 24).toFixed(1)} days`;
}

function ProgressBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const width =
    max > 0
      ? Math.max(
          0,
          Math.min(100, (value / max) * 100),
        )
      : 0;

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary"
        style={{
          width: `${width}%`,
        }}
      />
    </div>
  );
}

export default function QueryAnalytics() {
  const m = useCrmMetrics();

  const maxSourceTotal = Math.max(
    1,
    ...m.sourceStats.map((item) => item.total),
  );

  const maxPartnerTotal = Math.max(
    1,
    ...m.partnerStats.map((item) => item.total),
  );

  const maxEmployeeAssigned = Math.max(
    1,
    ...m.workload.map((item) => item.assigned),
  );

  const bestSource = useMemo(
    () =>
      [...m.sourceStats]
        .filter((item) => item.total >= 2)
        .sort(
          (a, b) =>
            b.conversion - a.conversion,
        )[0],
    [m.sourceStats],
  );

  const bestEmployee = useMemo(
    () =>
      [...m.workload].sort(
        (a, b) =>
          b.confirmed - a.confirmed ||
          b.conversion - a.conversion,
      )[0],
    [m.workload],
  );

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8">
      {/* HEADER */}
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          Query Management
        </p>

        <h1 className="mt-1 text-2xl font-bold">
          Query Analytics
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Commercial performance, source conversion,
          employee workload and stage efficiency from
          actual CRM activity.
        </p>
      </div>

      {/* TOP KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="pt-5">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />

            <p className="mt-4 text-2xl font-bold">
              {m.totalQueries}
            </p>

            <p className="text-sm text-muted-foreground">
              Total queries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Target className="h-5 w-5 text-muted-foreground" />

            <p className="mt-4 text-2xl font-bold">
              {(
                m.monthly.conversion
              ).toFixed(1)}
              %
            </p>

            <p className="text-sm text-muted-foreground">
              Current month conversion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <DollarSign className="h-5 w-5 text-muted-foreground" />

            <p className="mt-4 text-2xl font-bold">
              {formatMoney(m.totalPipelineValue)}
            </p>

            <p className="text-sm text-muted-foreground">
              Open pipeline value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Clock3 className="h-5 w-5 text-muted-foreground" />

            <p className="mt-4 text-2xl font-bold">
              {hoursLabel(
                m.weekly.avgResponseHours,
              )}
            </p>

            <p className="text-sm text-muted-foreground">
              Avg. response time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Users className="h-5 w-5 text-muted-foreground" />

            <p className="mt-4 text-2xl font-bold">
              {m.avgLeadsPerExecutive.toFixed(
                1,
              )}
            </p>

            <p className="text-sm text-muted-foreground">
              Avg. active leads / executive
            </p>
          </CardContent>
        </Card>
      </div>

      {/* MONTHLY */}
      <Card className="rounded-xl">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">
                Monthly Performance
              </h2>

              <p className="text-xs text-muted-foreground">
                Current month vs previous month.
              </p>
            </div>

            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricBox
              label="Leads"
              current={m.monthly.totalLeads}
              previous={m.monthly.prevTotalLeads}
            />

            <MetricBox
              label="Quotes Sent"
              current={m.monthly.quotesSent}
              previous={m.monthly.prevQuotesSent}
            />

            <MetricBox
              label="Confirmed"
              current={m.monthly.confirmed}
              previous={m.monthly.prevConfirmed}
            />

            <MetricBox
              label="Lost"
              current={m.monthly.lost}
              previous={m.monthly.prevLost}
            />

            <MetricBox
              label="Conversion"
              current={`${m.monthly.conversion.toFixed(
                1,
              )}%`}
              previous={`${m.monthly.prevConversion.toFixed(
                1,
              )}%`}
            />
          </div>
        </CardContent>
      </Card>

      {/* WEEKLY TREND */}
      <Card className="rounded-xl">
        <CardContent className="p-5">
          <h2 className="font-semibold">
            8-Week Trend
          </h2>

          <p className="text-xs text-muted-foreground">
            Lead creation, wins and losses from CRM events.
          </p>

          <div className="mt-5 space-y-4">
            {m.trends.map((week) => (
              <div
                key={week.key}
                className="grid gap-3 md:grid-cols-[90px_1fr_100px_100px_100px]"
              >
                <div className="font-medium">
                  {week.label}
                </div>

                <ProgressBar
                  value={week.leads}
                  max={Math.max(
                    1,
                    ...m.trends.map(
                      (x) => x.leads,
                    ),
                  )}
                />

                <div className="text-right text-sm">
                  Leads:{" "}
                  <strong>
                    {week.leads}
                  </strong>
                </div>

                <div className="text-right text-sm text-emerald-600">
                  Won:{" "}
                  <strong>
                    {week.won}
                  </strong>
                </div>

                <div className="text-right text-sm text-red-600">
                  Lost:{" "}
                  <strong>
                    {week.lost}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* EMPLOYEE PERFORMANCE */}
      <Card className="rounded-xl">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">
                Employee Performance
              </h2>

              <p className="text-xs text-muted-foreground">
                Workload, conversion, quotations and revenue by employee.
              </p>
            </div>

            {bestEmployee && (
              <Badge variant="secondary">
                Top: {bestEmployee.employee.name}
              </Badge>
            )}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3">
                    Employee
                  </th>

                  <th className="p-3 text-right">
                    Active
                  </th>

                  <th className="p-3 text-right">
                    New Today
                  </th>

                  <th className="p-3 text-right">
                    Quotes
                  </th>

                  <th className="p-3 text-right">
                    Overdue
                  </th>

                  <th className="p-3 text-right">
                    Confirmed
                  </th>

                  <th className="p-3 text-right">
                    Conversion
                  </th>

                  <th className="p-3 text-right">
                    Revenue
                  </th>
                </tr>
              </thead>

              <tbody>
                {m.workload.map((row) => (
                  <tr
                    key={row.employee.id}
                    className="border-b last:border-0"
                  >
                    <td className="p-3">
                      <div className="font-medium">
                        {row.employee.name}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {row.employee.role}
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      {row.assigned}
                    </td>

                    <td className="p-3 text-right">
                      {row.newToday}
                    </td>

                    <td className="p-3 text-right">
                      {row.quotations}
                    </td>

                    <td
                      className={`p-3 text-right ${
                        row.overdue > 0
                          ? "font-semibold text-red-600"
                          : ""
                      }`}
                    >
                      {row.overdue}
                    </td>

                    <td className="p-3 text-right">
                      {row.confirmed}
                    </td>

                    <td className="p-3 text-right">
                      {row.conversion.toFixed(1)}%
                    </td>

                    <td className="p-3 text-right font-medium">
                      {formatMoney(
                        row.revenue,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* SOURCE ANALYTICS */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  Lead Source Conversion
                </h2>

                <p className="text-xs text-muted-foreground">
                  Real conversion by source.
                </p>
              </div>

              {bestSource && (
                <Badge variant="secondary">
                  Best: {bestSource.name}
                </Badge>
              )}
            </div>

            <div className="mt-5 space-y-4">
              {m.sourceStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No source data available.
                </p>
              ) : (
                m.sourceStats
                  .slice(0, 10)
                  .map((item) => (
                    <div
                      key={item.name}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {item.name}
                        </span>

                        <span>
                          {item.conversion.toFixed(
                            1,
                          )}
                          %
                        </span>
                      </div>

                      <ProgressBar
                        value={item.total}
                        max={maxSourceTotal}
                      />

                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {item.total} total
                        </span>

                        <span>
                          {item.won} won •{" "}
                          {item.lost} lost
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardContent className="p-5">
            <h2 className="font-semibold">
              Partner / Customer Performance
            </h2>

            <p className="text-xs text-muted-foreground">
              Revenue contribution and volume.
            </p>

            <div className="mt-5 space-y-4">
              {m.partnerStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No partner data available.
                </p>
              ) : (
                m.partnerStats
                  .slice(0, 10)
                  .map((item) => (
                    <div
                      key={item.name}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {item.name}
                        </span>

                        <span>
                          {formatMoney(
                            item.value,
                          )}
                        </span>
                      </div>

                      <ProgressBar
                        value={item.total}
                        max={maxPartnerTotal}
                      />

                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {item.total} queries
                        </span>

                        <span>
                          {item.won} won •{" "}
                          {item.lost} lost
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* STAGE EFFICIENCY */}
      <Card className="rounded-xl">
        <CardContent className="p-5">
          <h2 className="font-semibold">
            Stage Efficiency
          </h2>

          <p className="text-xs text-muted-foreground">
            Average time spent in each stage from actual CRM stage-change events.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3">
                    Stage
                  </th>

                  <th className="p-3 text-right">
                    Average Time
                  </th>

                  <th className="p-3 text-right">
                    Samples
                  </th>
                </tr>
              </thead>

              <tbody>
                {m.stageAverages.map((item) => (
                  <tr
                    key={item.stage}
                    className="border-b last:border-0"
                  >
                    <td className="p-3 font-medium">
                      {item.stage}
                    </td>

                    <td className="p-3 text-right">
                      {hoursLabel(
                        item.avgHours,
                      )}
                    </td>

                    <td className="p-3 text-right">
                      {item.samples}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ESCALATIONS */}
      <Card className="rounded-xl border-red-200">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                Live SLA Escalations
              </h2>

              <p className="text-xs text-muted-foreground">
                Open queries currently beyond their follow-up deadline.
              </p>
            </div>

            <Badge variant="destructive">
              {m.escalations.length}
            </Badge>
          </div>

          {m.escalations.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No active SLA escalations.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {m.escalations
                .slice(0, 15)
                .map((item) => (
                  <div
                    key={item.query.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {item.query.query_id}
                      </p>

                      <p className="text-sm text-muted-foreground">
                        {item.query.customer} •{" "}
                        {item.query.owner ||
                          "Unassigned"}
                      </p>
                    </div>

                    <Badge variant="destructive">
                      {item.overdueHours.toFixed(1)}h overdue
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricBox({
  label,
  current,
  previous,
}: {
  label: string;
  current: number | string;
  previous: number | string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold">
        {current}
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        Previous: {previous}
      </p>
    </div>
  );
}
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Inbox, Wallet, Trophy, Percent, FileCheck2, AlarmClock, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryMetrics } from "@/lib/queries/metrics";
import {
  KpiCard, PageHeader, ReportingFilters, useReportingContext,
  inr, inrCompact, STATUS_BAR, StatusPill, EmptyState,
} from "@/components/queries/qm-ui";

export default function QueryDashboard() {
  const ctx = useReportingContext();
  const m = useQueryMetrics(ctx);

  const nurturing = m.stages.find((s) => s.status === "Nurturing")!;
  const won = m.stages.find((s) => s.status === "WIN")!;
  const lost = m.stages.find((s) => s.status === "LOST")!;
  const maxMonth = Math.max(1, ...m.monthly.map((x) => x.count));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        title="Query Performance Centre"
        subtitle="Decisions, commercial outcomes and team actions for the selected reporting period."
        actions={<ReportingFilters fys={m.fys} months={m.months} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Total Enquiries" value={m.total} sub={`${inrCompact(m.totalValue)} pipeline value`} icon={<Inbox className="h-4 w-4" />} />
        <KpiCard label="Open Opportunity Value" value={inrCompact(m.openValue)} sub={`${m.open.length} open queries`} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Confirmed Business" value={inrCompact(m.wonValue)} sub={`${m.won.length} won files`} tone="success" icon={<Trophy className="h-4 w-4" />} />
        <KpiCard label="Query-to-Win Rate" value={`${m.winRate.toFixed(1)}%`} sub={`Closed win rate ${m.closedWinRate.toFixed(1)}%`} icon={<Percent className="h-4 w-4" />} />
        <KpiCard label="Average Won File" value={inrCompact(m.avgWonFile)} sub="Per confirmed query" icon={<FileCheck2 className="h-4 w-4" />} />
        <KpiCard label="Overdue Follow-ups" value={m.overdueCount} sub={`${m.attentionPct.toFixed(0)}% of open queries`} tone={m.overdueCount ? "danger" : "default"} icon={<AlarmClock className="h-4 w-4" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Pipeline health */}
        <Card className="p-5 lg:col-span-2 rounded-xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold">Pipeline Health &amp; Trajectory</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Outcome distribution and monthly movement for the selected period.</p>
            </div>
            <div className="flex gap-6">
              <Metric label="Total Queries" value={String(m.total)} />
              <Metric label="Potential Value" value={inrCompact(m.totalValue)} />
              <Metric label="Closed Win Rate" value={`${m.closedWinRate.toFixed(1)}%`} />
            </div>
          </div>

          {/* Horizontal distribution */}
          <div className="mt-5">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {m.stages.map((s) =>
                s.count ? (
                  <div key={s.status} className={cn(STATUS_BAR[s.status])} style={{ width: `${s.pct}%` }} title={`${s.status}: ${s.count}`} />
                ) : null,
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <StageTile label="Nurturing" stat={nurturing} />
              <StageTile label="Won" stat={won} />
              <StageTile label="Lost" stat={lost} />
            </div>
          </div>

          {/* Monthly trajectory */}
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Monthly Trajectory</p>
            {m.monthly.length === 0 ? (
              <EmptyState message="No queries in this reporting period." />
            ) : (
              <div className="flex items-end gap-2 h-36 overflow-x-auto pb-1">
                {m.monthly.map((row) => (
                  <div key={row.key} className="flex flex-col items-center gap-1 min-w-14 flex-1">
                    <span className="text-[10px] tabular-nums text-muted-foreground">{row.count}</span>
                    <div className="w-full flex flex-col justify-end h-24 rounded-t bg-muted/60 overflow-hidden">
                      <div className="bg-emerald-500" style={{ height: `${(row.won / maxMonth) * 100}%` }} />
                      <div className="bg-primary" style={{ height: `${((row.count - row.won) / maxMonth) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{row.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Immediate action */}
        <Card className="p-5 rounded-xl flex flex-col">
          <h2 className="text-base font-semibold">Immediate Action</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Queries that need a touch today.</p>

          <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Overdue Follow-ups</p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-destructive">{m.overdueCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {m.attentionPct.toFixed(0)}% of {m.open.length} active queries require attention
            </p>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <Row label="Open queries" value={String(m.open.length)} />
            <Row label="Manager escalations" value={String(m.open.filter((q) => q.priority.escalated).length)} />
            <Row label="No follow-up scheduled" value={String(m.open.filter((q) => !q.priority.due).length)} />
          </div>

          <Button asChild className="mt-auto w-full">
            <Link to="/queries/follow-up-desk">
              Open Action Desk <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </Card>
      </div>

      {/* Status comparison */}
      <Card className="p-5 rounded-xl">
        <h2 className="text-base font-semibold">Status Comparison</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Count, share and commercial value by workflow stage.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-semibold">Stage</th>
                <th className="py-2 px-3 font-semibold text-right">Queries</th>
                <th className="py-2 px-3 font-semibold text-right">Share</th>
                <th className="py-2 px-3 font-semibold text-right">Value</th>
                <th className="py-2 pl-3 font-semibold w-[38%]">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {m.stages.map((s) => (
                <tr key={s.status} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3"><StatusPill status={s.status} /></td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-medium">{s.count}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{s.pct.toFixed(1)}%</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{inr(s.value)}</td>
                  <td className="py-2.5 pl-3">
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", STATUS_BAR[s.status])} style={{ width: `${s.pct}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function StageTile({ label, stat }: { label: string; stat: { count: number; pct: number; value: number } }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums">{stat.count}</span>
        <span className="text-xs text-muted-foreground">{stat.pct.toFixed(1)}%</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{inrCompact(stat.value)}</p>
    </div>
  );
}

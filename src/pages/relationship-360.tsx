import { Link, useParams } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  IndianRupee,
  Mail,
  MapPin,
  Phone,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAccessibleQueries } from "@/lib/crm/access";
import { durationLabel, hoursBetween } from "@/lib/crm/insights";
import { useClients } from "@/lib/crm/clients-store";
import { queryMatchesAgent, queryMatchesClient } from "@/lib/crm/relationship-links";
import { useAgents } from "@/lib/wizard/agents-store";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const dateLabel = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Not available";

export default function Relationship360({ type }: { type: "agent" | "client" }) {
  const { id } = useParams({ strict: false }) as { id: string };
  const agents = useAgents();
  const clients = useClients();
  const allQueries = useAccessibleQueries();
  const record =
    type === "agent" ? agents.find((a) => a.id === id) : clients.find((c) => c.id === id);
  if (!record)
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-10 text-center">
            <h1 className="text-xl font-bold">Relationship not found</h1>
            <Button asChild className="mt-4">
              <Link to={type === "agent" ? "/agents" : "/clients"}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  const queries = allQueries
    .filter((query) =>
      type === "agent" && "agency" in record
        ? queryMatchesAgent(query, record)
        : type === "client" && "mobile" in record
          ? queryMatchesClient(query, record)
          : false,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const open = queries.filter((q) => !["Won", "Lost"].includes(q.stage));
  const won = queries.filter((q) => q.stage === "Won");
  const lost = queries.filter((q) => q.stage === "Lost");
  const business = won.reduce(
    (sum, q) => sum + (q.commercials.final_selling || q.commercials.bottom_line || q.value || 0),
    0,
  );
  const opportunity = open.reduce((sum, q) => sum + (q.commercials.top_line || q.value || 0), 0);
  const last = [...queries].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const first = [...queries].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  const name =
    type === "agent"
      ? "agency" in record
        ? record.agency || record.name
        : record.name
      : record.name;
  const city = record.city || "City not set";
  const owner = record.relationship_owner || "Not assigned";
  const code =
    type === "agent" && "agent_code" in record
      ? record.agent_code
      : type === "client" && "client_code" in record
        ? record.client_code
        : record.id;
  const phone = "phone" in record ? record.phone : record.mobile;
  const address =
    type === "agent" && "agency" in record
      ? [record.address_line1, record.address_line2, record.city, record.state]
          .filter(Boolean)
          .join(", ")
      : "address" in record
        ? [record.address, record.city, record.state].filter(Boolean).join(", ")
        : [record.city, record.state].filter(Boolean).join(", ");
  const relationshipSince = record.created_at || first?.created_at;
  const lifecycle =
    type === "agent"
      ? "status" in record
        ? record.status || (open.length ? "Active" : "Dormant")
        : open.length
          ? "Active"
          : "Dormant"
      : queries.length > 1
        ? "Repeat Client"
        : open.length
          ? "Active Client"
          : won.length
            ? "Converted Client"
            : "New Client";
  const recentActivities = queries
    .flatMap((query) =>
      query.activities.map((activity) => ({
        ...activity,
        queryId: query.id,
        queryNo: query.query_id,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
  const followUps = open
    .filter((query) => query.followup_due || query.next_action)
    .sort((a, b) => (a.followup_due || "9999").localeCompare(b.followup_due || "9999"))
    .slice(0, 8);
  const cards = [
    ["Total Queries", queries.length, BriefcaseBusiness],
    ["Open", open.length, Target],
    ["Won", won.length, Trophy],
    ["Lost", lost.length, CalendarClock],
    [
      "Conversion",
      queries.length ? `${((won.length / queries.length) * 100).toFixed(1)}%` : "0%",
      Target,
    ],
    ["Business generated", money(business), IndianRupee],
    ["Open opportunity", money(opportunity), IndianRupee],
    [
      "Days since last Query",
      last ? Math.floor(hoursBetween(last.created_at) / 24) : "—",
      CalendarClock,
    ],
  ] as const;
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#053e3d] to-[#08918b] p-6 text-white">
        <Button asChild variant="ghost" className="mb-3 px-0 text-white">
          <Link to={type === "agent" ? "/agents" : "/clients"}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {type === "agent" ? "Agents" : "Clients"}
          </Link>
        </Button>
        <div className="flex flex-col justify-between gap-4 md:flex-row">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white text-teal-800">
                {type === "agent" ? "B2B Agent" : "B2C Client"}
              </Badge>
              <span className="font-mono text-sm text-teal-100">{code}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold">{name}</h1>
            <p className="mt-2 text-teal-100">
              <MapPin className="mr-1 inline h-4 w-4" />
              {city} · Relationship owner: {owner}
            </p>
          </div>
          <div className="text-sm">
            <p>
              <Phone className="mr-1 inline h-4 w-4" />
              {phone || "Mobile not set"}
            </p>
            <p className="mt-1">{record.email || "Email not set"}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex justify-between">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <Icon className="h-4 w-4 text-teal-600" />
              </div>
              <p className="mt-3 text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Query Journey</CardTitle>
            <p className="text-sm text-slate-500">
              One shared Query truth—this is a relationship view, not duplicated data.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {queries.map((query) => (
              <Link
                key={query.id}
                to="/queries/$id"
                params={{ id: query.id }}
                className="grid gap-3 rounded-xl border p-4 hover:border-teal-400 md:grid-cols-[1.2fr_1fr_auto]"
              >
                <div>
                  <p className="font-bold text-teal-700">{query.query_id}</p>
                  <p className="text-sm font-semibold">{query.program_name || query.destination}</p>
                </div>
                <div>
                  <p className="text-sm">{query.owner || "Awaiting assignment"}</p>
                  <p className="text-xs text-slate-500">
                    Travel{" "}
                    {query.travel_start
                      ? new Date(query.travel_start).toLocaleDateString("en-GB")
                      : "pending"}
                  </p>
                </div>
                <div className="text-right">
                  <Badge
                    variant={
                      query.stage === "Won"
                        ? "default"
                        : query.stage === "Lost"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {query.stage}
                  </Badge>
                  <p className="mt-1 text-sm font-bold">
                    {money(query.commercials.top_line || query.value || 0)}
                  </p>
                </div>
              </Link>
            ))}
            {!queries.length && (
              <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
                No linked Queries yet. Select this relationship while creating the next Query.
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{type === "agent" ? "Agent 360" : "Client 360"}</CardTitle>
              <p className="text-sm text-slate-500">
                {type === "agent"
                  ? "Relationship ownership and contact profile"
                  : "Direct traveller identity and ownership"}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["Relationship owner", owner, UserRound],
                  ["Lifecycle", lifecycle, Activity],
                  ["Mobile", phone || "Not set", Phone],
                  ["Email", record.email || "Not set", Mail],
                  ["City", city, MapPin],
                  ["Relationship since", dateLabel(relationshipSince), CalendarClock],
                  ["Last Query", last ? dateLabel(last.created_at) : "Never", CalendarClock],
                  ["Address", address || "Not set", Building2],
                ] as const
              ).map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Icon className="h-4 w-4 text-teal-600" />
                    {label}
                  </div>
                  <p className="mt-2 font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Funnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                ["Total", queries.length],
                ["Open", open.length],
                ["Won", won.length],
                ["Lost", lost.length],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                  <Progress value={queries.length ? (Number(value) / queries.length) * 100 : 0} />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Relationship Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span>Last Query</span>
                <strong>
                  {last ? new Date(last.created_at).toLocaleDateString("en-GB") : "Never"}
                </strong>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>Average won value</span>
                <strong>{money(won.length ? business / won.length : 0)}</strong>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span>Repeat relationship</span>
                <strong>{queries.length > 1 ? "Yes" : "Not yet"}</strong>
              </div>
              <div className="flex justify-between">
                <span>Relationship owner</span>
                <strong>{owner}</strong>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latest Relationship Activity</CardTitle>
            <p className="text-sm text-slate-500">Recent movements across every linked Query.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivities.map((activity) => (
              <Link
                key={`${activity.queryId}-${activity.id}`}
                to="/queries/$id"
                params={{ id: activity.queryId }}
                className="flex items-start justify-between gap-4 rounded-xl border p-4 hover:border-teal-400 hover:bg-teal-50/40"
              >
                <div>
                  <p className="font-semibold">{activity.title}</p>
                  <p className="text-xs text-slate-500">
                    {activity.queryNo} · {activity.by || "System"}
                    {activity.meta ? ` · ${activity.meta}` : ""}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-500">
                  {dateLabel(activity.at)}
                </span>
              </Link>
            ))}
            {!recentActivities.length && (
              <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">
                No activity has been recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Follow-ups / Next Steps</CardTitle>
            <p className="text-sm text-slate-500">
              Open actions across this relationship's active Queries.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {followUps.map((query) => {
              const overdue = Boolean(
                query.followup_due && new Date(query.followup_due).getTime() < Date.now(),
              );
              return (
                <Link
                  key={query.id}
                  to="/queries/$id"
                  params={{ id: query.id }}
                  className={`flex items-start justify-between gap-4 rounded-xl border p-4 hover:border-teal-400 ${
                    overdue ? "border-red-200 bg-red-50/60" : ""
                  }`}
                >
                  <div>
                    <p className="font-semibold">{query.next_action || "Review Query"}</p>
                    <p className="text-xs text-slate-500">
                      {query.query_id} · {query.owner || "Awaiting assignment"}
                    </p>
                  </div>
                  <div className="text-right">
                    {overdue && <Badge variant="destructive">Overdue</Badge>}
                    <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
                      {query.followup_due ? dateLabel(query.followup_due) : "Date pending"}
                    </p>
                  </div>
                </Link>
              );
            })}
            {!followUps.length && (
              <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">
                No open next steps for this relationship.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

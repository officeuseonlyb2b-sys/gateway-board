import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  IndianRupee,
  MapPin,
  Phone,
  Target,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAccessibleQueries } from "@/lib/crm/access";
import { durationLabel, hoursBetween } from "@/lib/crm/insights";
import { useClients } from "@/lib/crm/clients-store";
import { useAgents } from "@/lib/wizard/agents-store";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

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
  const queries = allQueries.filter((query) =>
    type === "agent"
      ? query.agent_id === id ||
        (query.customer_type === "B2B Agent" &&
          query.customer === ("agency" in record ? record.agency : ""))
      : query.client_id === id ||
        (query.customer_type === "B2C Client" && query.email && query.email === record.email),
  );
  const open = queries.filter((q) => !["Won", "Lost"].includes(q.stage));
  const won = queries.filter((q) => q.stage === "Won");
  const lost = queries.filter((q) => q.stage === "Lost");
  const closed = won.length + lost.length;
  const business = won.reduce((sum, q) => sum + (q.commercials.final_selling || q.value || 0), 0);
  const opportunity = open.reduce((sum, q) => sum + (q.commercials.top_line || q.value || 0), 0);
  const last = [...queries].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
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
  const cards = [
    ["Total Queries", queries.length, BriefcaseBusiness],
    ["Open", open.length, Target],
    ["Won", won.length, Trophy],
    ["Lost", lost.length, CalendarClock],
    ["Conversion", closed ? `${Math.round((won.length / closed) * 100)}%` : "0%", Target],
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
              {"phone" in record ? record.phone : record.mobile}
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
    </div>
  );
}

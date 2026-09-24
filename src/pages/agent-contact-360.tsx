import { Link, useParams } from "@tanstack/react-router";
import {
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
import {
  queryLostValue,
  queryOpenValue,
  queryPotentialCeiling,
  queryWonValue,
} from "@/lib/crm/relationship-insights";
import { queryMatchesAgent } from "@/lib/crm/relationship-links";
import { useAgents } from "@/lib/wizard/agents-store";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const key = (value?: string) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
const digits = (value?: string) => (value || "").replace(/\D/g, "");

export default function AgentContact360() {
  const { id } = useParams({ strict: false }) as { id: string };
  const agents = useAgents();
  const allQueries = useAccessibleQueries();
  const agent = agents.find((item) => item.contacts?.some((contact) => contact.id === id));
  const contact = agent?.contacts?.find((item) => item.id === id);
  if (!agent || !contact) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-10 text-center">
            <h1 className="text-xl font-bold">Agent contact not found</h1>
            <Button asChild className="mt-4">
              <Link to="/agents">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Agent Master
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  const companyQueries = allQueries.filter((query) => queryMatchesAgent(query, agent));
  const queries = companyQueries
    .filter((query) => {
      if (query.agent_contact_id) return query.agent_contact_id === contact.id;
      return (
        key(query.contact_person) === key(contact.name) ||
        (!!digits(contact.phone) && digits(query.mobile) === digits(contact.phone)) ||
        (!!key(contact.email) && key(query.email) === key(contact.email))
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const open = queries.filter((query) => !["Won", "Lost"].includes(query.stage));
  const won = queries.filter((query) => query.stage === "Won");
  const lost = queries.filter((query) => query.stage === "Lost");
  const wonValue = won.reduce((sum, query) => sum + queryWonValue(query), 0);
  const openValue = open.reduce((sum, query) => sum + queryOpenValue(query), 0);
  const lostValue = lost.reduce((sum, query) => sum + queryLostValue(query), 0);
  const lostCeiling = lost.reduce((sum, query) => sum + queryPotentialCeiling(query), 0);
  const companyWon = companyQueries
    .filter((query) => query.stage === "Won")
    .reduce((sum, query) => sum + queryWonValue(query), 0);
  const conversion = queries.length ? (won.length / queries.length) * 100 : 0;
  const contribution = companyWon ? (wonValue / companyWon) * 100 : 0;
  const last = queries[0];
  const cards = [
    ["Total Queries", queries.length, BriefcaseBusiness],
    ["Open", open.length, Target],
    ["Won", won.length, Trophy],
    ["Lost", lost.length, CalendarClock],
    ["Won business", money(wonValue), IndianRupee],
    ["Open opportunity", money(openValue), IndianRupee],
    ["Lost quoted value", money(lostValue), IndianRupee],
    ["Conversion", `${conversion.toFixed(1)}%`, Target],
  ] as const;
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#053e3d] to-[#08918b] p-6 text-white">
        <Button asChild variant="ghost" className="mb-3 px-0 text-white">
          <Link to="/agents/$id" params={{ id: agent.id }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {agent.agency}
          </Link>
        </Button>
        <div className="flex flex-col justify-between gap-4 md:flex-row">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white text-teal-800">B2B Contact</Badge>
              <span className="font-mono text-sm text-teal-100">
                {contact.contact_code || contact.id}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold">{contact.name}</h1>
            <p className="mt-2 text-teal-100">
              <Building2 className="mr-1 inline h-4 w-4" />
              {agent.agency} · {contact.designation || "Designation not set"}
            </p>
          </div>
          <div className="text-sm">
            <p>
              <Phone className="mr-1 inline h-4 w-4" />
              {contact.phone || "Mobile not set"}
            </p>
            <p className="mt-1">
              <Mail className="mr-1 inline h-4 w-4" />
              {contact.email || "Email not set"}
            </p>
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
      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Contact Query Journey</CardTitle>
            <p className="text-sm text-slate-500">
              Every Query linked to this person under {agent.agency}.
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
                    Created {new Date(query.created_at).toLocaleDateString("en-GB")}
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
                    {money(
                      query.stage === "Lost"
                        ? queryLostValue(query)
                        : query.stage === "Won"
                          ? queryWonValue(query)
                          : queryOpenValue(query),
                    )}
                  </p>
                </div>
              </Link>
            ))}
            {!queries.length && (
              <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
                No linked Queries yet.
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact 360</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["Company", agent.agency, Building2],
                ["Relationship owner", agent.relationship_owner || "Not assigned", UserRound],
                ["City", contact.city || agent.city || "Not set", MapPin],
                [
                  "Last Query",
                  last ? new Date(last.created_at).toLocaleDateString("en-GB") : "Never",
                  CalendarClock,
                ],
              ].map(([label, value, Icon]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <Icon className="h-4 w-4 text-teal-600" />
                    {String(label)}
                  </div>
                  <p className="mt-2 font-semibold">{String(value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Company Contribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span>Won value contribution</span>
                <strong>{contribution.toFixed(1)}%</strong>
              </div>
              <Progress value={contribution} />
              <div className="flex justify-between text-sm text-slate-500">
                <span>Contact won</span>
                <span>{money(wonValue)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>Company won</span>
                <span>{money(companyWon)}</span>
              </div>
              <div className="flex justify-between border-t pt-3 text-sm">
                <span>Lost potential ceiling</span>
                <strong>{money(lostCeiling)}</strong>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addClient, useClients, type Client } from "@/lib/crm/clients-store";
import { useAccessibleQueries } from "@/lib/crm/access";
import { queryMatchesClient } from "@/lib/crm/relationship-links";
import type { CrmQuery } from "@/lib/crm/types";

const PAGE_SIZE = 25;

const money = (value: number) => {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)} L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)} K`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

function relationshipMetrics(client: Client, queries: CrmQuery[]) {
  const linked = queries.filter((query) => queryMatchesClient(query, client));
  const open = linked.filter((query) => !["Won", "Lost"].includes(query.stage));
  const won = linked.filter((query) => query.stage === "Won");
  const business = won.reduce(
    (sum, query) =>
      sum + (query.commercials.final_selling || query.commercials.bottom_line || query.value || 0),
    0,
  );
  const lifecycle =
    linked.length > 1
      ? "Repeat Client"
      : open.length > 0
        ? "Active Client"
        : won.length > 0
          ? "Converted Client"
          : "New Client";
  return {
    linked,
    open: open.length,
    won: won.length,
    business,
    conversion: linked.length ? (won.length / linked.length) * 100 : 0,
    lifecycle,
  };
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const clients = useClients();
  const queries = useAccessibleQueries();
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("all");
  const [lifecycle, setLifecycle] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    city: "",
    relationship_owner: "",
    notes: "",
  });

  const owners = useMemo(
    () =>
      Array.from(
        new Set(clients.map((client) => client.relationship_owner).filter(Boolean) as string[]),
      ).sort(),
    [clients],
  );
  const clientRows = useMemo(
    () => clients.map((client) => ({ client, metrics: relationshipMetrics(client, queries) })),
    [clients, queries],
  );
  const filtered = clientRows.filter(({ client, metrics }) => {
    const matchesSearch = [
      client.client_code,
      client.id,
      client.name,
      client.mobile,
      client.email,
      client.city,
      client.relationship_owner,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    return (
      matchesSearch &&
      (owner === "all" || client.relationship_owner === owner) &&
      (lifecycle === "all" || metrics.lifecycle === lifecycle)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const save = () => {
    if (!form.name.trim()) return toast.error("Client name is required.");
    try {
      addClient({ ...form, active: true });
      setOpen(false);
      setForm({ name: "", mobile: "", email: "", city: "", relationship_owner: "", notes: "" });
      toast.success("Client added to the organisation-wide master");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Client could not be added");
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700">Organisation-wide relationship master</p>
          <h1 className="text-3xl font-bold">B2C Client Master</h1>
          <p className="text-sm text-slate-500">
            Direct traveller profiles are matched to every Query and open into a complete Client 360
            dashboard.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="secondary">Auto-created from B2C Queries</Badge>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total clients", clients.length, "Unique direct traveller records"],
          [
            "Repeat clients",
            clientRows.filter(({ metrics }) => metrics.linked.length > 1).length,
            "More than one linked Query",
          ],
          [
            "Active enquiries",
            clientRows.reduce((sum, { metrics }) => sum + metrics.open, 0),
            "Currently open B2C Queries",
          ],
          [
            "Converted business",
            money(clientRows.reduce((sum, { metrics }) => sum + metrics.business, 0)),
            "Won Query value",
          ],
        ].map(([label, value, caption]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search client, mobile, email, city or ID"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={owner}
            onValueChange={(value) => {
              setOwner(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All executives" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All executives</SelectItem>
              {owners.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={lifecycle}
            onValueChange={(value) => {
              setLifecycle(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All lifecycle stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lifecycle stages</SelectItem>
              {["New Client", "Active Client", "Converted Client", "Repeat Client"].map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                <TableHead>Client ID</TableHead>
                <TableHead>Name / contact</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Queries</TableHead>
                <TableHead>Open</TableHead>
                <TableHead>Won</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(({ client, metrics }) => {
                const openDashboard = () =>
                  navigate({ to: "/clients/$id", params: { id: client.id } });
                return (
                  <TableRow
                    key={client.id}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open ${client.name} Client 360 dashboard`}
                    className="cursor-pointer transition-colors hover:bg-teal-50/70 focus-visible:bg-teal-50 focus-visible:outline-none"
                    onClick={openDashboard}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDashboard();
                      }
                    }}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-teal-700">
                      {client.client_code || client.id}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{client.name}</div>
                      <div className="text-xs text-slate-500">
                        {[client.mobile, client.email].filter(Boolean).join(" · ") ||
                          "Contact not set"}
                      </div>
                    </TableCell>
                    <TableCell>{client.city || "—"}</TableCell>
                    <TableCell>{client.relationship_owner || "Not assigned"}</TableCell>
                    <TableCell className="font-semibold">{metrics.linked.length}</TableCell>
                    <TableCell>{metrics.open}</TableCell>
                    <TableCell>{metrics.won}</TableCell>
                    <TableCell className="font-semibold">{money(metrics.business)}</TableCell>
                    <TableCell>{metrics.conversion.toFixed(1)}%</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{metrics.lifecycle}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/clients/$id" params={{ id: client.id }}>
                          <Eye className="mr-1 h-4 w-4" />
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!paged.length && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-slate-500">
                    No B2C clients found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <div className="text-slate-500">
              Page {safePage} of {totalPages} · {filtered.length} clients
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add B2C Client</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["name", "Name"],
                ["mobile", "Mobile"],
                ["email", "Email"],
                ["city", "City"],
                ["relationship_owner", "Relationship owner"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save Client</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

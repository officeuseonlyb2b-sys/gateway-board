import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addClient, useClients } from "@/lib/crm/clients-store";
import { useAccessibleQueries } from "@/lib/crm/access";

export default function ClientsPage() {
  const clients = useClients();
  const queries = useAccessibleQueries();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    city: "",
    relationship_owner: "",
    notes: "",
  });
  const filtered = clients.filter((client) =>
    [client.name, client.mobile, client.email, client.city, client.relationship_owner]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
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
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">Organisation-wide relationship master</p>
          <h1 className="text-3xl font-bold">B2C Clients</h1>
          <p className="text-sm text-slate-500">
            Relationship ownership remains separate from the advisor handling an individual Query.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search name, contact, city or relationship owner"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total clients", clients.length],
          [
            "Repeat clients",
            clients.filter(
              (client) =>
                queries.filter(
                  (query) =>
                    query.client_id === client.id ||
                    (query.customer_type === "B2C Client" &&
                      query.email &&
                      query.email === client.email),
                ).length > 1,
            ).length,
          ],
          [
            "Open B2C Queries",
            queries.filter(
              (query) =>
                query.customer_type === "B2C Client" && !["Won", "Lost"].includes(query.stage),
            ).length,
          ],
          [
            "B2C business won",
            `₹${(queries.filter((query) => query.customer_type === "B2C Client" && query.stage === "Won").reduce((sum, query) => sum + (query.commercials.final_selling || query.value || 0), 0) / 100000).toFixed(1)}L`,
          ],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((client) => {
          const linked = queries.filter(
            (query) =>
              query.client_id === client.id ||
              (query.customer_type === "B2C Client" && query.email && query.email === client.email),
          );
          return (
            <Card key={client.id}>
              <CardHeader className="flex-row items-center gap-3">
                <span className="rounded-full bg-teal-50 p-3">
                  <UserRound className="h-5 w-5 text-teal-700" />
                </span>
                <div>
                  <CardTitle>{client.name}</CardTitle>
                  <p className="text-xs text-slate-500">{client.city || "City not set"}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-mono text-xs text-teal-700">{client.client_code || client.id}</p>
                <p>
                  {client.mobile || "—"} · {client.email || "—"}
                </p>
                <p>
                  <strong>Relationship owner:</strong> {client.relationship_owner || "Not assigned"}
                </p>
                <p>
                  <strong>Queries:</strong> {linked.length}
                </p>
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link to="/clients/$id" params={{ id: client.id }}>
                    Open Client 360
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {!filtered.length && (
          <Card>
            <CardContent className="p-10 text-center text-slate-500">
              No B2C clients found.
            </CardContent>
          </Card>
        )}
      </div>
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

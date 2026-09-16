import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, Users, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAgents, deleteAgent, type Agent } from "@/lib/wizard/agents-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AgentFormDialog } from "@/components/AgentFormDialog";
import { useAccessibleQueries } from "@/lib/crm/access";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agents — MP Tourism Hub" }] }),
  component: AgentsPage,
});

const PAGE_SIZE = 25;

function AgentsPage() {
  const agents = useAgents();
  const queries = useAccessibleQueries();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [stateF, setStateF] = useState<string>("all");
  const [cityF, setCityF] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [confirmDel, setConfirmDel] = useState<Agent | null>(null);
  const [viewing, setViewing] = useState<Agent | null>(null);

  const states = useMemo(
    () => Array.from(new Set(agents.map((a) => a.state).filter(Boolean))) as string[],
    [agents],
  );
  const cities = useMemo(
    () => Array.from(new Set(agents.map((a) => a.city).filter(Boolean))) as string[],
    [agents],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return agents.filter((a) => {
      if (status !== "all" && (a.status || "Active") !== status) return false;
      if (stateF !== "all" && a.state !== stateF) return false;
      if (cityF !== "all" && a.city !== cityF) return false;
      if (!term) return true;
      return [a.name, a.agency, a.phone, a.email, a.city, a.gst_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [agents, q, status, stateF, cityF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: Agent) => {
    setEditing(a);
    setFormOpen(true);
  };
  const doDelete = () => {
    if (!confirmDel) return;
    deleteAgent(confirmDel.id);
    toast.success("Agent deleted");
    setConfirmDel(null);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-accent" /> Agents
          </h1>
          <p className="text-sm text-muted-foreground">
            Master directory of travel agents used across quotations.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add Agent
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Name, agency, mobile, email, city, GST…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Prospect">Prospect</SelectItem>
                <SelectItem value="Dormant">Dormant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">State</Label>
            <Select
              value={stateF}
              onValueChange={(v) => {
                setStateF(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {states.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">City</Label>
            <Select
              value={cityF}
              onValueChange={(v) => {
                setCityF(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total agents", agents.length],
          [
            "Active relationships",
            agents.filter((agent) => (agent.status || "Active") === "Active").length,
          ],
          [
            "Open B2B Queries",
            queries.filter(
              (query) =>
                query.customer_type === "B2B Agent" && !["Won", "Lost"].includes(query.stage),
            ).length,
          ],
          [
            "B2B business won",
            `₹${(queries.filter((query) => query.customer_type === "B2B Agent" && query.stage === "Won").reduce((sum, query) => sum + (query.commercials.final_selling || query.value || 0), 0) / 100000).toFixed(1)}L`,
          ],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Agency</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>City / State</TableHead>
              <TableHead>GST</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No agents found
                </TableCell>
              </TableRow>
            ) : (
              paged.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-mono text-[10px] text-teal-700">
                      {a.agent_code || a.id}
                    </div>
                    <div className="font-medium">{a.name}</div>
                    {a.contact_person && a.contact_person !== a.name && (
                      <div className="text-xs text-muted-foreground">{a.contact_person}</div>
                    )}
                  </TableCell>
                  <TableCell>{a.agency}</TableCell>
                  <TableCell>
                    <div className="text-sm">{a.phone}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {[a.city, a.state].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{a.gst_number || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={(a.status || "Active") === "Active" ? "default" : "secondary"}>
                      {a.status || "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button asChild size="icon" variant="ghost" title="Open Agent 360">
                        <Link to="/agents/$id" params={{ id: a.id }}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(a)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirmDel(a)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t text-sm">
            <div className="text-muted-foreground">
              Page {pageSafe} of {totalPages} · {filtered.length} agents
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pageSafe <= 1}
                onClick={() => setPage(pageSafe - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage(pageSafe + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AgentFormDialog open={formOpen} onOpenChange={setFormOpen} agent={editing} />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel && (
                <>
                  This will remove{" "}
                  <b>
                    {confirmDel.name} — {confirmDel.agency}
                  </b>{" "}
                  from the master. Existing quotations already using this agent will keep their
                  stored details.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>{viewing?.agency}</DialogDescription>
          </DialogHeader>
          {viewing && <AgentProfile a={viewing} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function AgentProfile({ a }: { a: Agent }) {
  return (
    <div className="space-y-5">
      <section>
        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Basic</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Person" value={a.contact_person} />
          <Field label="Mobile" value={a.phone} />
          <Field label="Alternate Mobile" value={a.alt_phone} />
          <Field label="Email" value={a.email} />
          <Field label="Website" value={a.website} />
          <Field label="WhatsApp" value={a.whatsapp} />
        </div>
      </section>
      <section>
        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Address</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Address 1" value={a.address_line1} />
          <Field label="Address 2" value={a.address_line2} />
          <Field label="City" value={a.city} />
          <Field label="State" value={a.state} />
          <Field label="Country" value={a.country} />
          <Field label="Pincode" value={a.pincode} />
        </div>
      </section>
      <section>
        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Business</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GST" value={a.gst_number} />
          <Field label="PAN" value={a.pan_number} />
          <Field label="IATA" value={a.iata} />
          <Field label="Agency Type" value={a.agency_type} />
          <Field label="Relationship Owner" value={a.relationship_owner} />
          <Field label="Preferred Currency" value={a.preferred_currency} />
          <Field label="Credit Limit" value={a.credit_limit} />
          <Field label="Payment Terms" value={a.payment_terms} />
          <Field label="Status" value={a.status} />
        </div>
      </section>
      {(a.notes || a.internal_remarks) && (
        <section>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Notes</h4>
          <div className="grid gap-3">
            <Field label="Notes" value={a.notes} />
            <Field label="Internal Remarks" value={a.internal_remarks} />
          </div>
        </section>
      )}
      <section className="pt-3 border-t text-xs text-muted-foreground">
        Created {a.created_at ? new Date(a.created_at).toLocaleString() : "—"} · Updated{" "}
        {a.updated_at ? new Date(a.updated_at).toLocaleString() : "—"}
      </section>
    </div>
  );
}

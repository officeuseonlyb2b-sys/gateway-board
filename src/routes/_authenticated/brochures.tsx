import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Archive, BookOpenCheck, CopyPlus, Eye, FileDown, Search, Send, TableProperties } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSavedQuotes, type SavedQuote } from "@/lib/quotes-store";
import { useAuth } from "@/lib/auth-mock";
import { useAccessProfile } from "@/lib/crm/access";
import { fmtDateShort, inr } from "@/lib/format";
import { brochurePricingCoverage, createBrochureFromQuote, duplicateBrochureVersion, setBrochureStatus, useBrochures, type BrochureStatus, type BrochureVersion } from "@/lib/brochures-store";

export const Route = createFileRoute("/_authenticated/brochures")({
  head: () => ({ meta: [{ title: "Programme-wise Brochures — MP Tourism Hub" }] }),
  component: BrochuresPage,
});

function BrochuresPage() {
  const brochures = useBrochures();
  const quotes = useSavedQuotes();
  const user = useAuth();
  const access = useAccessProfile();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | BrochureStatus>("all");
  const [sourceId, setSourceId] = useState("");
  const [matrix, setMatrix] = useState<BrochureVersion | null>(null);
  const eligible = useMemo(() => quotes.filter((quote) => quote.brochure_source?.programme_id), [quotes]);
  const filtered = useMemo(() => brochures.filter((item) => {
    const needle = search.trim().toLowerCase();
    return (!needle || [item.name, item.programme_name, item.programme_code, item.status].filter(Boolean).join(" ").toLowerCase().includes(needle)) && (status === "all" || item.status === status);
  }), [brochures, search, status]);
  const actor = user?.name || "Unknown";
  const publishable = access.canManageCostingMasters;
  const create = () => {
    const quote = eligible.find((item) => item.id === sourceId);
    if (!quote) return toast.error("Choose a saved Brochure costing snapshot.");
    try { createBrochureFromQuote(quote, actor); setSourceId(""); toast.success("Brochure library draft created from the immutable costing snapshot."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not create brochure."); }
  };
  const transition = (item: BrochureVersion, next: BrochureStatus) => {
    if ((next === "Published" || next === "Archived") && !publishable) return toast.error("Only an authorised pricing administrator can publish or archive brochure prices.");
    try { setBrochureStatus(item.id, next); toast.success(`Brochure marked ${next}.`); } catch (error) { toast.error(error instanceof Error ? error.message : "Status update failed."); }
  };
  return <div className="mx-auto max-w-[1600px] p-6 lg:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><BookOpenCheck className="h-5 w-5 text-primary" /></div><div><h1 className="text-2xl font-bold">Programme-wise Brochures</h1><p className="text-sm text-muted-foreground">Reusable, versioned package prices from saved Brochure costings. Published prices are immutable snapshots.</p></div></div><Link to="/costing"><Button variant="outline">Open Costing Builder</Button></Link></div>
    <Card className="mb-4 p-4"><div className="grid gap-3 md:grid-cols-[1fr_280px_auto]"><Select value={sourceId} onValueChange={setSourceId}><SelectTrigger><SelectValue placeholder="Create from saved Brochure costing…" /></SelectTrigger><SelectContent>{eligible.map((quote: SavedQuote) => <SelectItem key={quote.id} value={quote.id}>{quote.brochure_source?.programme_name} · {quote.display_number || quote.quote_number} · {quote.brochure_source?.pax_min}–{quote.brochure_source?.pax_max} Pax</SelectItem>)}</SelectContent></Select><div className="text-xs text-muted-foreground self-center">Only a canonical Programme-linked, saved Brochure costing can seed a library.</div><Button onClick={create} disabled={!sourceId}>Create library draft</Button></div>{eligible.length === 0 && <p className="mt-3 text-sm text-amber-700">No eligible saved Brochure costings yet. Cost a Brochure against a canonical Programme, save its immutable snapshot, then return here.</p>}</Card>
    <Card className="mb-4 p-4"><div className="flex flex-wrap gap-3"><div className="relative min-w-64 flex-1"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search programme, code, brochure…"/></div><Select value={status} onValueChange={(value) => setStatus(value as "all" | BrochureStatus)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Ready for Review">Ready for Review</SelectItem><SelectItem value="Published">Published</SelectItem><SelectItem value="Archived">Archived</SelectItem></SelectContent></Select></div></Card>
    <Card className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead className="border-b bg-muted/30 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="p-3">Programme / Brochure</th><th className="p-3">Days</th><th className="p-3">Pax</th><th className="p-3">Hotel / Transport options</th><th className="p-3">Validity</th><th className="p-3">Status / Version</th><th className="p-3">Updated / Created by</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{filtered.map((item) => <BrochureRow key={item.id} item={item} canPublish={publishable} onMatrix={() => setMatrix(item)} onTransition={transition} actor={actor}/>)}</tbody></table></div>{!filtered.length && <div className="p-12 text-center text-sm text-muted-foreground">No brochure library entries match the current filters.</div>}</Card>
    {matrix && <PricingMatrix brochure={matrix} close={() => setMatrix(null)} />}
  </div>;
}

function BrochureRow({ item, canPublish, onMatrix, onTransition, actor }: { item: BrochureVersion; canPublish: boolean; onMatrix: () => void; onTransition: (item: BrochureVersion, status: BrochureStatus) => void; actor: string }) {
  const coverage = brochurePricingCoverage(item);
  return <tr className="border-b last:border-0 hover:bg-muted/20"><td className="p-3"><div className="font-semibold">{item.programme_name}</div><div className="text-xs text-muted-foreground">{item.programme_code || "No code"} · {item.name}</div></td><td className="p-3">{item.days_nights}</td><td className="p-3">{coverage.configured_pax_range}</td><td className="p-3 text-xs"><div>{coverage.hotel_options} hotel option{coverage.hotel_options === 1 ? "" : "s"} · {coverage.transport_variations} transport variation{coverage.transport_variations === 1 ? "" : "s"}</div><div className="text-muted-foreground">{coverage.occupancy_combinations} sharing basis · {coverage.valid_scenarios} valid scenario{coverage.valid_scenarios === 1 ? "" : "s"}{coverage.missing_or_invalid_scenarios ? ` · ${coverage.missing_or_invalid_scenarios} issue(s)` : ""}</div><div className={coverage.readiness === "Ready" ? "text-emerald-700" : "text-amber-700"}>Coverage: {coverage.readiness}</div></td><td className="p-3 text-xs">{fmtDateShort(item.validity_from)} – {fmtDateShort(item.validity_till)}</td><td className="p-3"><Badge variant={item.status === "Published" ? "default" : "secondary"}>{item.status}</Badge><div className="mt-1 text-xs text-muted-foreground">V{item.version}</div></td><td className="p-3 text-xs"><div>{fmtDateShort(item.updated_at)}</div><div className="text-muted-foreground">{item.created_by}</div></td><td className="p-3"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="View pricing matrix" onClick={onMatrix}><TableProperties className="h-4 w-4"/></Button><Button size="icon" variant="ghost" title="Create new version" onClick={() => { duplicateBrochureVersion(item.id, actor); toast.success("New editable brochure version created."); }}><CopyPlus className="h-4 w-4"/></Button>{item.status === "Draft" && <Button size="sm" variant="outline" onClick={() => onTransition(item, "Ready for Review")}>Review</Button>}{item.status === "Ready for Review" && <Button size="sm" disabled={!canPublish} onClick={() => onTransition(item, "Published")}><Send className="mr-1 h-3.5 w-3.5"/>Publish</Button>}{item.status === "Published" && <Button size="icon" variant="ghost" disabled={!canPublish} title="Archive" onClick={() => onTransition(item, "Archived")}><Archive className="h-4 w-4"/></Button>}</div></td></tr>;
}

function PricingMatrix({ brochure, close }: { brochure: BrochureVersion; close: () => void }) {
  const [pax, setPax] = useState("all"); const [hotel, setHotel] = useState("all"); const [transport, setTransport] = useState("all");
  const rows = brochure.scenarios.filter((item) => (pax === "all" || item.pax === Number(pax)) && (hotel === "all" || item.hotel_category === hotel) && (transport === "all" || item.transport === transport));
  const hotels = [...new Set(brochure.scenarios.map((item) => item.hotel_category))]; const transports = [...new Set(brochure.scenarios.map((item) => item.transport))];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="max-h-[90vh] w-full max-w-6xl overflow-hidden"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">Pricing Matrix · {brochure.programme_name} · V{brochure.version}</h2><p className="text-xs text-muted-foreground">Saved final package prices only; no recalculation occurs here.</p></div><Button variant="ghost" onClick={close}>Close</Button></div><div className="flex flex-wrap gap-2 p-4"><Select value={pax} onValueChange={setPax}><SelectTrigger className="w-28"><SelectValue placeholder="Pax"/></SelectTrigger><SelectContent><SelectItem value="all">All Pax</SelectItem>{[...new Set(brochure.scenarios.map((item) => item.pax))].sort((a,b)=>a-b).map((value) => <SelectItem key={value} value={String(value)}>{value} Pax</SelectItem>)}</SelectContent></Select><Select value={hotel} onValueChange={setHotel}><SelectTrigger className="w-44"><SelectValue placeholder="Hotel"/></SelectTrigger><SelectContent><SelectItem value="all">All Hotels</SelectItem>{hotels.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={transport} onValueChange={setTransport}><SelectTrigger className="w-44"><SelectValue placeholder="Transport"/></SelectTrigger><SelectContent><SelectItem value="all">All Transport</SelectItem>{transports.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" onClick={() => window.print()}><FileDown className="mr-1 h-3.5 w-3.5"/>Print / Export</Button></div><div className="max-h-[60vh] overflow-auto border-t"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-muted text-left text-xs"><tr><th className="p-3">Pax</th><th className="p-3">Hotel category</th><th className="p-3">Transport</th><th className="p-3">Sharing</th><th className="p-3 text-right">Price / pax</th><th className="p-3 text-right">Group total</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-b"><td className="p-3">{item.pax}</td><td className="p-3">{item.hotel_category}</td><td className="p-3">{item.transport}</td><td className="p-3">{item.occupancy}</td><td className="p-3 text-right font-medium">{inr(item.price_per_person)}</td><td className="p-3 text-right">{inr(item.group_total)}</td></tr>)}</tbody></table></div></Card></div>;
}

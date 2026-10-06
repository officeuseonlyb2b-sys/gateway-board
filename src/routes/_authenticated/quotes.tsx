import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import {
  FileText,
  Eye,
  Printer,
  FileDown,
  FileSpreadsheet,
  Ban,
  CopyPlus,
  Search,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quoteToRevisionDraft, useSavedQuotes, voidQuote, type SavedQuote } from "@/lib/quotes-store";
import { upsertDraft } from "@/lib/drafts-store";
import { writeDraft } from "@/lib/wizard/store";
import { useAuth } from "@/lib/auth-mock";
import { inr, fmtDateShort } from "@/lib/format";
import { QuoteViewerDialog } from "@/components/QuoteViewerDialog";
import { exportQuoteExcel, exportAllQuotesExcel } from "@/lib/quotes-export";

export const Route = createFileRoute("/_authenticated/quotes")({
  head: () => ({ meta: [{ title: "Recent Quotes — MP Tourism Hub" }] }),
  component: SavedQuotesPage,
});

function SavedQuotesPage() {
  const navigate = useNavigate();
  const user = useAuth();
  const quotes = useSavedQuotes();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<"week" | "all">("week");
  const [viewing, setViewing] = useState<SavedQuote | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);
    return quotes.filter((x) => {
      if (needle) {
        const hay = [
          x.quote_number,
          x.query_id,
          x.tour_title,
          ...x.cities,
          ...x.itinerary.map((d) => d.hotel_name),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (range === "week" && new Date(x.saved_at) < weekStart) return false;
      if (from && x.saved_at.slice(0, 10) < from) return false;
      if (to && x.saved_at.slice(0, 10) > to) return false;
      return true;
    });
  }, [quotes, q, from, to, range]);

  function print(quote: SavedQuote) {
    setViewing(quote);
    setTimeout(() => window.print(), 400);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Recent Quotes</h1>
            <p className="text-sm text-muted-foreground">
              Recently generated quotations, connected back to their Queries.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!filtered.length}
          onClick={() => {
            exportAllQuotesExcel(filtered);
            toast.success("Exported all quotes.");
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export All to Excel
        </Button>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by quote no, tour, city, hotel…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="From"
          />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
          <div className="flex rounded-md border bg-muted/30 p-1">
            <Button
              size="sm"
              variant={range === "week" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setRange("week")}
            >
              Last 7 days
            </Button>
            <Button
              size="sm"
              variant={range === "all" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setRange("all")}
            >
              All
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            No quotations match the selected period. You can switch to All to view older quotations.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left py-2.5 px-4">Quote No</th>
                <th className="text-left py-2.5 px-2">Query</th>
                <th className="text-left py-2.5 px-2">Tour</th>
                <th className="text-center py-2.5 px-2">Nights</th>
                <th className="text-left py-2.5 px-2">Cities</th>
                <th className="text-right py-2.5 px-2">Average per person</th>
                <th className="text-left py-2.5 px-2">Saved By</th>
                <th className="text-left py-2.5 px-2">Date</th>
                <th className="text-right py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((qu, index) => {
                const group = quoteDayLabel(qu.saved_at);
                const previousGroup =
                  index > 0 ? quoteDayLabel(filtered[index - 1].saved_at) : null;
                return (
                  <Fragment key={qu.id}>
                    {group !== previousGroup && (
                      <tr className="border-y bg-muted/40">
                        <td
                          colSpan={9}
                          className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                        >
                          {group}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4 font-mono text-xs">
                        <div>{qu.display_number || `${qu.quote_number}-V${qu.version || 1}`}</div>
                        <div className="mt-1 text-[10px] font-sans text-muted-foreground">{qu.status || "Generated"}</div>
                      </td>
                      <td className="py-2.5 px-2 text-xs">
                        {qu.query_id ? (
                          <Link
                            to="/queries/$id"
                            params={{ id: qu.query_id }}
                            className="font-semibold text-primary hover:underline"
                          >
                            {qu.query_id}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Independent</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 font-medium">{qu.tour_title}</td>
                      <td className="py-2.5 px-2 text-center">{qu.total_nights}</td>
                      <td className="py-2.5 px-2 text-muted-foreground text-xs">
                        {qu.cities.join(" → ")}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-semibold">
                        {inr(qu.scenarios?.[0]?.per_person_avg ?? qu.totals.grand_dbl / 2)}
                        <span className="text-muted-foreground font-normal">/pax</span>
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground text-xs">{qu.saved_by}</td>
                      <td className="py-2.5 px-2 text-muted-foreground text-xs">
                        {fmtDateShort(qu.saved_at)}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="View"
                            onClick={() => setViewing(qu)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Download PDF"
                            onClick={() => {
                              setViewing(qu);
                              setTimeout(() => window.print(), 400);
                            }}
                          >
                            <FileDown className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Download Excel"
                            onClick={() => exportQuoteExcel(qu)}
                          >
                            <FileSpreadsheet className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Print"
                            onClick={() => print(qu)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Create revision"
                            onClick={() => {
                              const reason = window.prompt(`Reason for revising ${qu.display_number || qu.quote_number}:`);
                              if (!reason?.trim()) return;
                              try {
                                const revision = quoteToRevisionDraft(qu, reason);
                                const draftId = upsertDraft(
                                  revision,
                                  undefined,
                                  `${qu.quote_number} · Revision V${revision.intended_version}`,
                                );
                                writeDraft(revision);
                                navigate({ to: "/costing", search: { id: draftId } });
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Could not create revision");
                              }
                            }}
                          >
                            <CopyPlus className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Void with reason"
                            disabled={qu.status === "Void"}
                            onClick={() => {
                              const reason = window.prompt(`Reason for voiding ${qu.display_number || qu.quote_number}:`);
                              if (!reason?.trim()) return;
                              try {
                                voidQuote(qu.id, reason, user?.name || "Unknown");
                                toast.success("Quotation marked Void. The locked record has been retained.");
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Could not void quotation");
                              }
                            }}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <QuoteViewerDialog quote={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function quoteDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((todayDay - day) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

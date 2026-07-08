import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Eye, Printer, FileDown, FileSpreadsheet, Trash2, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteQuote, useSavedQuotes, type SavedQuote } from "@/lib/quotes-store";
import { inr, fmtDateShort } from "@/lib/format";
import { QuoteViewerDialog } from "@/components/QuoteViewerDialog";
import { exportQuoteExcel, exportAllQuotesExcel } from "@/lib/quotes-export";

export const Route = createFileRoute("/_authenticated/quotes")({
  head: () => ({ meta: [{ title: "Saved Quotes — MP Tourism Hub" }] }),
  component: SavedQuotesPage,
});

function SavedQuotesPage() {
  const quotes = useSavedQuotes();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<SavedQuote | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return quotes.filter((x) => {
      if (needle) {
        const hay = [x.quote_number, x.tour_title, ...x.cities,
          ...x.itinerary.map((d) => d.hotel_name)].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (from && x.saved_at.slice(0, 10) < from) return false;
      if (to && x.saved_at.slice(0, 10) > to) return false;
      return true;
    });
  }, [quotes, q, from, to]);

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
            <h1 className="text-2xl font-bold tracking-tight">Saved Quotes</h1>
            <p className="text-sm text-muted-foreground">All saved tour cost estimates.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={!filtered.length}
          onClick={() => { exportAllQuotesExcel(filtered); toast.success("Exported all quotes."); }}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export All to Excel
        </Button>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by quote no, tour, city, hotel…" value={q}
              onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
            No saved quotes yet. Save one from the Final Costing page.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="text-left py-2.5 px-4">Quote No</th>
                <th className="text-left py-2.5 px-2">Tour</th>
                <th className="text-center py-2.5 px-2">Nights</th>
                <th className="text-left py-2.5 px-2">Cities</th>
                <th className="text-right py-2.5 px-2">Per Person (2P)</th>
                <th className="text-left py-2.5 px-2">Saved By</th>
                <th className="text-left py-2.5 px-2">Date</th>
                <th className="text-right py-2.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((qu) => (
                <tr key={qu.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="py-2.5 px-4 font-mono text-xs">{qu.quote_number}</td>
                  <td className="py-2.5 px-2 font-medium">{qu.tour_title}</td>
                  <td className="py-2.5 px-2 text-center">{qu.total_nights}</td>
                  <td className="py-2.5 px-2 text-muted-foreground text-xs">{qu.cities.join(" → ")}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{inr(qu.totals.grand_dbl / 2)}<span className="text-muted-foreground font-normal">/pax</span></td>
                  <td className="py-2.5 px-2 text-muted-foreground text-xs">{qu.saved_by}</td>
                  <td className="py-2.5 px-2 text-muted-foreground text-xs">{fmtDateShort(qu.saved_at)}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="View" onClick={() => setViewing(qu)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Download PDF"
                        onClick={() => { setViewing(qu); setTimeout(() => window.print(), 400); }}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Download Excel"
                        onClick={() => exportQuoteExcel(qu)}>
                        <FileSpreadsheet className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Print" onClick={() => print(qu)}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Delete"
                        onClick={() => {
                          if (confirm(`Delete quote ${qu.quote_number}?`)) {
                            deleteQuote(qu.id); toast.success("Deleted.");
                          }
                        }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <QuoteViewerDialog quote={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

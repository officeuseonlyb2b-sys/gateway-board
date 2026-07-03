import { useEffect } from "react";
import { Printer, FileDown, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteDocument } from "./QuoteDocument";
import { exportQuoteExcel } from "@/lib/quotes-export";
import type { SavedQuote } from "@/lib/quotes-store";

// Full-screen quote preview with Print / PDF / Excel / Close actions.
export function QuoteViewerDialog({
  quote, open, onClose,
}: { quote: SavedQuote | null; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("quote-viewer-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("quote-viewer-open");
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !quote) return null;

  return (
    <div className="quote-viewer-overlay fixed inset-0 z-[9999] bg-black/60 flex flex-col items-center overflow-auto">
      {/* Action bar (hidden in print) */}
      <div className="quote-viewer-actions w-full bg-white border-b border-border shadow-sm sticky top-0 z-10">
        <div className="max-w-[900px] mx-auto flex items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold">
            Quote Preview · <span className="text-primary">{quote.quote_number}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}
              title="Uses browser Print → Save as PDF">
              <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportQuoteExcel(quote)}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" /> Download Excel
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Close
            </Button>
          </div>
        </div>
      </div>

      {/* Document */}
      <div className="my-6 shadow-2xl">
        <QuoteDocument quote={quote} />
      </div>
    </div>
  );
}

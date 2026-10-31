import { FileDown, Printer, Save, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuoteDraft } from "@/lib/wizard/types";
import { FinalCostingWorkspace } from "./FinalCostingWorkspace";

interface Props {
  draft: QuoteDraft;
  isFinalizing: boolean;
  canFinalize: boolean;
  finalizeBlockers: string[];
  costingWarnings: string[];
  version: number;
  onSaveDraft: () => void;
  onFinalize: () => void | Promise<void>;
  onRequestReview: () => void;
}

const PRINTABLE_A4_LANDSCAPE = { width: 1085, height: 756 };
const TRIP_LAND_HEIGHT_SAFETY = 0.96;
const PRINT_FIT_SELECTOR = ".print-trip-land-page, .print-commercial-matrix-page";

function preparePrintFit() {
  document.querySelectorAll<HTMLElement>(PRINT_FIT_SELECTOR).forEach((section) => {
    section.style.removeProperty("--print-fit-scale");
    const contentWidth = Math.max(section.scrollWidth, section.getBoundingClientRect().width);
    const contentHeight = Math.max(section.scrollHeight, section.getBoundingClientRect().height);
    const availableHeight =
      PRINTABLE_A4_LANDSCAPE.height *
      (section.classList.contains("print-trip-land-page") ? TRIP_LAND_HEIGHT_SAFETY : 1);
    const scale = Math.min(
      PRINTABLE_A4_LANDSCAPE.width / Math.max(1, contentWidth),
      availableHeight / Math.max(1, contentHeight),
      1,
    );
    const fittedScale = Math.max(0.1, scale);
    section.style.setProperty("--print-fit-scale", String(fittedScale));
    section.dataset.printFitScale = fittedScale.toFixed(4);
  });
}

function clearPrintFit() {
  document.querySelectorAll<HTMLElement>(PRINT_FIT_SELECTOR).forEach((section) => {
    section.style.removeProperty("--print-fit-scale");
    delete section.dataset.printFitScale;
  });
}

const nextAnimationFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function printPreview() {
  document.body.classList.add("quote-viewer-open");
  window.addEventListener("beforeprint", preparePrintFit, { once: true });
  const cleanup = () => {
    document.body.classList.remove("quote-viewer-open");
    clearPrintFit();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  await document.fonts?.ready;
  await nextAnimationFrame();
  await nextAnimationFrame();
  preparePrintFit();
  window.print();
  window.setTimeout(cleanup, 1_500);
}

/** Step 10 renders the Step 9 sheet from the same draft snapshot. */
export function CustomerQuotationPreview({
  draft,
  isFinalizing,
  canFinalize,
  finalizeBlockers,
  costingWarnings,
  version,
  onSaveDraft,
  onFinalize,
  onRequestReview,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Preview &amp; Save</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only Final Quotation Review using the exact selections from Step 9.
          </p>
          {draft.query_type === "Brochure" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Save Brochure Draft stores a standalone immutable pricing snapshot; no CRM Query is required.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printPreview}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button
            variant="outline"
            onClick={printPreview}
            title="Choose Save as PDF in the print dialog"
          >
            <FileDown className="mr-2 h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" onClick={onRequestReview}>
            <Send className="mr-2 h-4 w-4" /> Request Review
          </Button>
          <Button variant="outline" onClick={onSaveDraft}>
            <Save className="mr-2 h-4 w-4" /> Save Draft
          </Button>
          {draft.query_type === "Brochure" && (
            <Button
              disabled={!canFinalize || isFinalizing}
              onClick={onFinalize}
              title={finalizeBlockers.join(" ") || "Save this immutable Brochure pricing snapshot."}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              {isFinalizing ? "Saving..." : "Save Brochure Draft"}
            </Button>
          )}
          {draft.query_type !== "Brochure" && <Button
            disabled={!canFinalize || isFinalizing}
            onClick={onFinalize}
            title={
              isFinalizing
                ? "The official costing version is being saved."
                : finalizeBlockers.join(" ") || "Save this immutable official costing version."
            }
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {isFinalizing ? "Saving…" : `Save Costing · V${version}`}
          </Button>}
        </div>
      </div>

      {!isFinalizing && finalizeBlockers.length > 0 && (
        <div className="no-print rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
          <div className="font-semibold">Costing V{version} cannot be saved:</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {finalizeBlockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {!isFinalizing && costingWarnings.length > 0 && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          <div className="font-semibold">
            Costing V{version} will be saved as In Progress with these warnings:
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {costingWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="quote-print-target bg-white">
        <FinalCostingWorkspace draft={draft} set={() => undefined} readOnly />
      </div>
    </div>
  );
}

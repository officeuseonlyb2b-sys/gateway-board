import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardList, X } from "lucide-react";
import { useActiveWizard } from "@/lib/wizard/active-wizard";
import { Button } from "@/components/ui/button";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 30) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function ActiveWizardBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = useActiveWizard();
  // Per-page hide: reset whenever the pathname changes (component key)
  const [hidden, setHidden] = useState(false);

  if (!active) return null;
  if (pathname.startsWith("/costing")) return null;
  if (hidden) return null;

  const name = active.programName || "Untitled quotation";
  return (
    <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center gap-3 text-sm print:hidden">
      <ClipboardList className="h-4 w-4 shrink-0 text-accent" />
      <div className="flex-1 min-w-0 truncate">
        <span className="font-semibold">Quotation in progress:</span>{" "}
        <span className="truncate">"{name}"</span>
        <span className="mx-2 opacity-60">·</span>
        <span className="opacity-90">Step {active.step} of 18</span>
        <span className="mx-2 opacity-60">·</span>
        <span className="opacity-75">Last saved {timeAgo(active.savedAt)}</span>
      </div>
      <Button
        asChild
        size="sm"
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Link
          to="/costing"
          search={active.draftId ? { id: active.draftId } : {}}
        >
          Continue Quotation →
        </Link>
      </Button>
      <button
        onClick={() => setHidden(true)}
        aria-label="Hide"
        className="opacity-70 hover:opacity-100 p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

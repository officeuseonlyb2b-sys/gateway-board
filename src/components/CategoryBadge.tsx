import { cn } from "@/lib/utils";
import type { HotelCategory } from "@/lib/mock-store";

const STYLES: Record<HotelCategory, string> = {
  "3 Star": "bg-slate-100 text-slate-700 ring-slate-200",
  "3 Star Deluxe": "bg-slate-200 text-slate-800 ring-slate-300",
  "4 Star": "bg-zinc-200 text-zinc-800 ring-zinc-300",
  "4 Star Superior": "bg-zinc-300 text-zinc-900 ring-zinc-400",
  "5 Star": "bg-amber-100 text-amber-900 ring-amber-300",
  "5 Star Deluxe": "bg-amber-200 text-amber-900 ring-amber-400",
  "5 Star Luxury": "bg-gradient-to-r from-amber-300 to-yellow-400 text-amber-950 ring-amber-500",
  "Heritage": "bg-rose-100 text-rose-800 ring-rose-300",
  "Excellent Budget": "bg-emerald-100 text-emerald-800 ring-emerald-300",
};

export function CategoryBadge({ category, className }: { category: HotelCategory; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        STYLES[category],
        className,
      )}
    >
      {category}
    </span>
  );
}

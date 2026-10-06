import { cn } from "@/lib/utils";
import type { HotelCategory } from "@/lib/mock-store";

const STYLES: Record<HotelCategory, string> = {
  "3 Star": "bg-slate-100 text-slate-700 ring-slate-200",
  "3 Star Deluxe": "bg-sky-100 text-sky-800 ring-sky-200",
  "4 Star": "bg-blue-100 text-blue-800 ring-blue-200",
  "4 Star Superior": "bg-indigo-100 text-indigo-800 ring-indigo-200",
  "5 Star": "bg-amber-100 text-amber-900 ring-amber-300",
  "5 Star Deluxe": "bg-orange-100 text-orange-900 ring-orange-300",
  "5 Star Luxury": "bg-gradient-to-r from-amber-300 to-orange-400 text-amber-950 ring-orange-500",
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

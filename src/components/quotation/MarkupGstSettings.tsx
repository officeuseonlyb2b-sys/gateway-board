// Markup & GST settings — Land Part vs Hotels & Meals, stored per quotation.
// Relocated from Program Selection (Step 4) to the top of the Costing step.
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QuoteDraft } from "@/lib/wizard/types";
import type { StepProps } from "./shared";

export function MarkupGstSettings({ draft, set }: StepProps) {
  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  const groups: Array<{ title: string; hint: string; mk: keyof QuoteDraft; gst: keyof QuoteDraft }> = [
    { title: "Land Part", hint: "Transport, Guide, Entrances, Activities & Misc", mk: "land_markup_percent", gst: "land_gst_percent" },
    { title: "Hotels & Meals", hint: "Room rates (SGL/DBL/TRP/QUAD) & Lunch/Dinner", mk: "hotel_markup_percent", gst: "hotel_gst_percent" },
  ];
  return (
    <Card className="p-4">
      <div className="section-label mb-3">Markup &amp; GST Settings</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g.title} className="rounded-lg border p-3 space-y-2 bg-muted/20">
            <div>
              <div className="text-sm font-semibold">{g.title}</div>
              <div className="text-[11px] text-muted-foreground">{g.hint}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Markup %</Label>
                <Input type="number" min={0} step="0.5" className="h-8"
                  value={(draft[g.mk] as number | undefined) ?? 10}
                  onChange={(e) => {
                    const v = num(e.target.value);
                    const patch: Partial<QuoteDraft> = { [g.mk]: v } as Partial<QuoteDraft>;
                    // Keep the legacy overall markup in sync with Land Part.
                    if (g.mk === "land_markup_percent") patch.markup_percent = v;
                    set(patch);
                  }} />
              </div>
              <div>
                <Label className="text-[10px]">GST %</Label>
                <Input type="number" min={0} step="0.5" className="h-8"
                  value={(draft[g.gst] as number | undefined) ?? 5}
                  onChange={(e) => set({ [g.gst]: num(e.target.value) } as Partial<QuoteDraft>)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Markup & GST settings — Land Part vs Hotels & Meals, stored per quotation.
// Relocated from Program Selection (Step 4) to the top of the Costing step.
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const queryFor = draft.query_for || (draft.commercial_mode === "accommodation_only" ? "Accommodation Part" : draft.commercial_mode === "transport_only" ? "Land Part" : "Package");
  const visibleGroups = queryFor === "Package" ? groups : groups.filter((group) => queryFor === "Land Part" ? group.title === "Land Part" : group.title === "Hotels & Meals");
  return (
    <Card className="p-4">
      <div className="mb-4">
        <div>
          <Label className="text-xs">Query For</Label>
          <p className="mt-1 text-sm font-semibold">{queryFor}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Package GST is fixed at 5%. Land Part and Accommodation Part allow only 5% or 18%.
        </p>
      </div>
      <div className="section-label mb-3">Markup &amp; GST Settings</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleGroups.map((g) => {
          const inactive = false;
          return (
          <div key={g.title} className={`rounded-lg border p-3 space-y-2 bg-muted/20 ${inactive ? "opacity-45" : ""}`}>
            <div>
              <div className="text-sm font-semibold">{g.title}</div>
              <div className="text-[11px] text-muted-foreground">{g.hint}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Markup %</Label>
                <Input type="number" min={0} step="0.5" className="h-8"
                  disabled={inactive}
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
                {queryFor === "Package" ? (
                  <Input value={5} readOnly className="h-8 bg-muted" />
                ) : (
                  <Select
                    disabled={inactive}
                    value={String((draft[g.gst] as number | undefined) ?? 5)}
                    onValueChange={(value) => set({ [g.gst]: Number(value) } as Partial<QuoteDraft>)}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        )})}
      </div>
    </Card>
  );
}

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
  return (
    <Card className="p-4">
      <div className="mb-4 grid gap-3 md:grid-cols-[260px_1fr] md:items-end">
        <div>
          <Label className="text-xs">Commercial format</Label>
          <Select
            value={draft.commercial_mode || "package"}
            onValueChange={(value) => {
              const mode = value as QuoteDraft["commercial_mode"];
              set({
                commercial_mode: mode,
                scenarios: undefined,
                ...(mode === "package" ? { land_gst_percent: 5, hotel_gst_percent: 5 } : {}),
              });
            }}
          >
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="package">Complete package</SelectItem>
              <SelectItem value="transport_only">Transport only</SelectItem>
              <SelectItem value="accommodation_only">Accommodation only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Package GST is fixed at 5%. Transport-only and accommodation-only quotes can use 5% or 18%.
        </p>
      </div>
      <div className="section-label mb-3">Markup &amp; GST Settings</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => {
          const inactive = (draft.commercial_mode === "transport_only" && g.title === "Hotels & Meals")
            || (draft.commercial_mode === "accommodation_only" && g.title === "Land Part");
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
                {draft.commercial_mode === "package" || !draft.commercial_mode ? (
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

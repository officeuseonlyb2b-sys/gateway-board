import { useMemo, useState } from "react";
import { Plus, Trash2, Copy, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  db, MEAL_PLANS, type RatePlan, type MealPlan, type SupplementType,
} from "@/lib/mock-store";
import { notify } from "@/lib/notify";

type MealRow = { double: string; single: string; extra: string };

interface Props {
  roomId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed?: { validity_start: string; validity_end: string; season_label: string };
  existingGroup?: RatePlan[]; // editing
}

const emptyMeal = (): MealRow => ({ double: "", single: "", extra: "" });

export function SeasonFormDialog({ roomId, open, onOpenChange, seed, existingGroup }: Props) {
  const isEdit = !!existingGroup && existingGroup.length > 0;
  const first = existingGroup?.[0];

  const [start, setStart] = useState(first?.validity_start ?? seed?.validity_start ?? "");
  const [end, setEnd] = useState(first?.validity_end ?? seed?.validity_end ?? "");
  const [label, setLabel] = useState(first?.season_label ?? seed?.season_label ?? "");
  const [saving, setSaving] = useState(false);

  const [meals, setMeals] = useState<Record<MealPlan, MealRow>>(() => {
    const init: Record<MealPlan, MealRow> = { CP: emptyMeal(), MAP: emptyMeal(), AP: emptyMeal() };
    existingGroup?.forEach((p) => {
      init[p.meal_plan] = {
        double: String(p.double_rate ?? ""),
        single: String(p.single_rate ?? ""),
        extra: String(p.extra_bed_rate ?? ""),
      };
    });
    return init;
  });

  const [lunch, setLunch] = useState(first?.lunch_rate?.toString() ?? "");
  const [dinner, setDinner] = useState(first?.dinner_rate?.toString() ?? "");
  const [extraBkf, setExtraBkf] = useState(first?.extra_breakfast_rate?.toString() ?? "");

  const [cwbMode, setCwbMode] = useState<"fixed" | "rule">(first?.cwb_rule_text ? "rule" : "fixed");
  const [cwbAmt, setCwbAmt] = useState(first?.cwb_rate?.toString() ?? "");
  const [cwbRule, setCwbRule] = useState(first?.cwb_rule_text ?? "");

  const [xmas, setXmas] = useState(first?.xmas_supplement?.toString() ?? "");
  const [xmasType, setXmasType] = useState<SupplementType>(first?.xmas_supplement_type ?? "per_person");
  const [ny, setNy] = useState(first?.newyear_supplement?.toString() ?? "");
  const [nyType, setNyType] = useState<SupplementType>(first?.newyear_supplement_type ?? "per_person");

  const [remarks, setRemarks] = useState(first?.remarks ?? "");

  function num(v: string): number { return v.trim() === "" ? 0 : Number(v); }
  function numOrNull(v: string): number | null { return v.trim() === "" ? null : Number(v); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) return toast.error("Set both validity dates.");
    if (new Date(end) < new Date(start)) return toast.error("End date must be after start date.");

    setSaving(true);
    await new Promise((r) => setTimeout(r, 200));

    if (isEdit && existingGroup) {
      existingGroup.forEach((p) => db.deleteRatePlan(p.id));
    }

    const base = {
      room_category_id: roomId,
      validity_start: start, validity_end: end,
      season_label: label,
      cwb_rate: cwbMode === "fixed" ? numOrNull(cwbAmt) : null,
      cwb_rule_text: cwbMode === "rule" ? (cwbRule || null) : null,
      lunch_rate: numOrNull(lunch),
      dinner_rate: numOrNull(dinner),
      extra_breakfast_rate: numOrNull(extraBkf),
      xmas_supplement: numOrNull(xmas), xmas_supplement_type: xmasType,
      newyear_supplement: numOrNull(ny), newyear_supplement_type: nyType,
      remarks: remarks || null,
    };

    const rows = MEAL_PLANS
      .filter((mp) => meals[mp].double || meals[mp].single || meals[mp].extra)
      .map((mp) => ({
        ...base,
        meal_plan: mp,
        double_rate: num(meals[mp].double),
        single_rate: num(meals[mp].single),
        extra_bed_rate: num(meals[mp].extra),
      }));

    if (rows.length === 0) {
      setSaving(false);
      return toast.error("Enter rates for at least one meal plan (CP / MAP / AP).");
    }

    db.addRatePlans(rows);
    setSaving(false);
    toast.success(isEdit ? "Season updated." : `Season added with ${rows.length} meal plan${rows.length > 1 ? "s" : ""}.`);
    if (!isEdit) {
      notify.success("Rate Plan Added", `${rows.length} meal plan${rows.length > 1 ? "s" : ""} added for the selected room.`);
    } else {
      notify.info("Rate Plan Updated", `Season rates updated.`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Season" : "Add Season / Validity"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Validity Start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Validity End</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Season Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Peak Season" />
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-2 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Meal Plan Rates (₹)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="font-medium py-2 px-4">Plan</th>
                  <th className="font-medium py-2 px-3">Double</th>
                  <th className="font-medium py-2 px-3">Single</th>
                  <th className="font-medium py-2 px-3">Extra Bed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MEAL_PLANS.map((mp) => (
                  <tr key={mp}>
                    <td className="py-2 px-4 font-semibold">{mp}</td>
                    {(["double", "single", "extra"] as const).map((k) => (
                      <td key={k} className="py-2 px-3">
                        <Input
                          type="number" inputMode="numeric" placeholder="0"
                          value={meals[mp][k]}
                          onChange={(e) => setMeals((m) => ({ ...m, [mp]: { ...m[mp], [k]: e.target.value } }))}
                          className="h-9"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Lunch (per person)" value={lunch} onChange={setLunch} />
            <Field label="Dinner (per person)" value={dinner} onChange={setDinner} />
            <Field label="Extra Breakfast" value={extraBkf} onChange={setExtraBkf} />
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Child With Bed (CWB)</Label>
              <RadioGroup
                value={cwbMode}
                onValueChange={(v) => setCwbMode(v as "fixed" | "rule")}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="fixed" /> Fixed Amount
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="rule" /> Custom Rule
                </label>
              </RadioGroup>
            </div>
            {cwbMode === "fixed" ? (
              <Input type="number" placeholder="₹ amount" value={cwbAmt} onChange={(e) => setCwbAmt(e.target.value)} />
            ) : (
              <Input placeholder='e.g. "06-12 Y / Rs.1500"' value={cwbRule} onChange={(e) => setCwbRule(e.target.value)} />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SupplementField label="X'mas Supplement" amount={xmas} setAmount={setXmas} type={xmasType} setType={setXmasType} />
            <SupplementField label="N'Year Supplement" amount={ny} setAmount={setNy} type={nyType} setType={setNyType} />
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Blackout dates, special conditions…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save changes" : "Save season"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SupplementField({
  label, amount, setAmount, type, setType,
}: { label: string; amount: string; setAmount: (v: string) => void; type: SupplementType; setType: (t: SupplementType) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1" />
        <Select value={type} onValueChange={(v) => setType(v as SupplementType)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="per_person">Per Person</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function ratePlanGroups(plans: RatePlan[]) {
  const groups = new Map<string, RatePlan[]>();
  plans.forEach((p) => {
    const key = `${p.validity_start}__${p.validity_end}__${p.season_label}`;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  });
  return Array.from(groups.values()).sort(
    (a, b) => +new Date(a[0].validity_start) - +new Date(b[0].validity_start),
  );
}

export { Pencil as EditIcon, Trash2 as DeleteIcon, Copy as DuplicateIcon, Plus as PlusIcon };

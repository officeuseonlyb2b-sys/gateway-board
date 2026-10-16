import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inr } from "@/lib/format";
import { useDB } from "@/lib/mock-store";
import { getCostingPaxValues } from "@/lib/wizard/calc";
import { applyLandCommercials, miscPerPersonForPax } from "@/lib/wizard/land-pricing";
import type { MiscLine, PaxRangePrice } from "@/lib/wizard/types";
import { uid, type StepProps } from "../shared";

const basisOf = (item: MiscLine) =>
  item.rate_basis ?? (item.unit === "per_person" ? "per_person" : "fixed_range");

export function Step14({ draft, set }: StepProps) {
  const db = useDB();
  const paxValues = getCostingPaxValues(draft);
  const itemName = (item: MiscLine) =>
    item.custom_name ||
    db.miscellaneous_items.find((masterItem) => masterItem.id === item.item_id)?.name ||
    "";
  const patchItem = (id: string, patch: Partial<MiscLine>) =>
    set({ misc: draft.misc.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const addItem = () =>
    set({
      misc: [
        ...draft.misc,
        {
          id: uid(),
          custom_name: "",
          qty: 1,
          rate: 0,
          unit: "per_person",
          rate_basis: "per_person",
          pax_ranges: [],
        },
      ],
    });
  const updateRange = (item: MiscLine, index: number, patch: Partial<PaxRangePrice>) =>
    patchItem(item.id, {
      pax_ranges: (item.pax_ranges ?? []).map((range, i) =>
        i === index ? { ...range, ...patch } : range,
      ),
    });
  const addRange = (item: MiscLine) =>
    patchItem(item.id, {
      pax_ranges: [...(item.pax_ranges ?? []), { from_pax: 1, to_pax: 1, rate: 0 }],
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Miscellaneous</h2>
          <p className="text-xs text-muted-foreground">
            Quotation-specific items only; no shared master records are created.
          </p>
        </div>
        <Button size="sm" onClick={addItem}>
          <Plus className="mr-1 h-4 w-4" />
          Add Item
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[850px] text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">S.No.</th>
              <th className="p-2 text-left">Particular</th>
              <th className="p-2 text-left">Pax Range</th>
              <th className="p-2 text-left">Rate Basis</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {draft.misc.length === 0 && (
              <tr>
                <td colSpan={6} className="p-5 text-center text-muted-foreground">
                  No miscellaneous items added.
                </td>
              </tr>
            )}
            {draft.misc.flatMap((item, itemIndex) => {
              const basis = basisOf(item);
              const ranges =
                basis === "per_person"
                  ? [undefined]
                  : item.pax_ranges?.length
                    ? item.pax_ranges
                    : [undefined];
              return ranges.map((range, rangeIndex) => (
                <tr key={`${item.id}-${rangeIndex}`} className="border-t align-middle">
                  <td className="p-2">
                    {itemIndex + 1}
                    {ranges.length > 1 ? `.${rangeIndex + 1}` : ""}
                  </td>
                  <td className="p-2">
                    <Input
                      className="h-8 min-w-40"
                      value={itemName(item)}
                      onChange={(e) => patchItem(item.id, { custom_name: e.target.value })}
                      placeholder="Particular"
                    />
                  </td>
                  <td className="p-2">
                    {basis === "per_person" ? (
                      <span className="text-muted-foreground">All applicable</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min={1}
                          max={40}
                          value={range?.from_pax ?? 1}
                          onChange={(e) =>
                            updateRange(item, rangeIndex, {
                              from_pax: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                        <span>–</span>
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min={range?.from_pax ?? 1}
                          max={40}
                          value={range?.to_pax ?? 1}
                          onChange={(e) =>
                            updateRange(item, rangeIndex, {
                              to_pax: Math.max(range?.from_pax ?? 1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <Select
                      value={basis}
                      onValueChange={(value) =>
                        patchItem(item.id, {
                          rate_basis: value as MiscLine["rate_basis"],
                          unit: value === "per_person" ? "per_person" : "fixed",
                          pax_ranges:
                            value === "per_person"
                              ? item.pax_ranges
                              : item.pax_ranges?.length
                                ? item.pax_ranges
                                : [{ from_pax: 1, to_pax: 1, rate: 0 }],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 min-w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_person">Per Person</SelectItem>
                        <SelectItem value="fixed_range">Fixed Total / Pax Range</SelectItem>
                        {basis === "foc_range" && (
                          <SelectItem value="foc_range" disabled>
                            Legacy FOC / Fixed Total
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Input
                      className="ml-auto h-8 w-28 text-right"
                      type="number"
                      min={0}
                      value={basis === "per_person" ? item.rate || "" : range?.rate || ""}
                      onChange={(e) =>
                        basis === "per_person"
                          ? patchItem(item.id, { rate: Number(e.target.value) || 0 })
                          : updateRange(item, rangeIndex, { rate: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      {basis !== "per_person" && (
                        <Button size="sm" variant="outline" onClick={() => addRange(item)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          ranges.length > 1
                            ? patchItem(item.id, {
                                pax_ranges: (item.pax_ranges ?? []).filter(
                                  (_, i) => i !== rangeIndex,
                                ),
                              })
                            : set({ misc: draft.misc.filter((entry) => entry.id !== item.id) })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      {draft.misc.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold">Pax-wise Miscellaneous Costing</h3>
          <p className="mb-3 text-xs text-muted-foreground">Including Markup &amp; GST</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-left">Pax</th>
                  {draft.misc.map((item) => (
                    <th key={item.id} className="p-2 text-right">
                      {itemName(item) || "Untitled"}
                    </th>
                  ))}
                  <th className="p-2 text-right">Service Total</th>
                  <th className="p-2 text-right">Markup</th>
                  <th className="p-2 text-right">GST</th>
                  <th className="p-2 text-right">Final Per Person</th>
                </tr>
              </thead>
              <tbody>
                {paxValues.map((pax) => {
                  const values = draft.misc.map((item) => miscPerPersonForPax(item, pax));
                  const service = values.reduce((sum, value) => sum + value, 0);
                  const commercial = applyLandCommercials(draft, service);
                  return (
                    <tr key={pax} className="border-t">
                      <td className="p-2 font-medium">{pax}</td>
                      {values.map((value, index) => (
                        <td key={draft.misc[index].id} className="p-2 text-right">
                          {value ? inr(value) : "—"}
                        </td>
                      ))}
                      <td className="p-2 text-right">{inr(service)}</td>
                      <td className="p-2 text-right">{inr(commercial.markup)}</td>
                      <td className="p-2 text-right">{inr(commercial.gst)}</td>
                      <td className="p-2 text-right font-semibold">{inr(commercial.final)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// Shared helpers & types used across the extracted wizard step components.
// Extracted verbatim from src/routes/_authenticated/costing.tsx to enable
// modular step files with zero UI/behavior change.
import React, { useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { QuoteDraft, RoutingDay } from "@/lib/wizard/types";

export type StepProps = { draft: QuoteDraft; set: (p: Partial<QuoteDraft>) => void };
export type CityRef = { id: string; name: string };

export function NumericStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className,
  inputClassName,
  ariaLabel,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  inputClassName?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);

  const clamp = (candidate: number) =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, candidate));
  const commit = () => {
    if (text === String(value)) return;
    const parsed = Number(text);
    const next = clamp(Number.isFinite(parsed) ? Math.trunc(parsed) : min);
    setText(String(next));
    if (next !== value) onChange(next);
  };
  const bump = (amount: number) => {
    const next = clamp(value + amount * step);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={disabled || value <= min}
        onClick={() => bump(-1)}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn("h-8 text-center", inputClassName)}
        onWheel={(event) => event.currentTarget.blur()}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          if (nextText === "") return;
          const parsed = Number(nextText);
          if (Number.isInteger(parsed) && parsed >= min && (max === undefined || parsed <= max))
            onChange(parsed);
        }}
        onBlur={commit}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        aria-label={`Increase ${ariaLabel}`}
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => bump(1)}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function uid() { return Math.random().toString(36).slice(2, 10); }

export function dayDestInfo(r: RoutingDay, cities: { id: string; name: string }[]) {
  const ids = (r.to_city_ids && r.to_city_ids.length > 0)
    ? r.to_city_ids
    : [r.to_city_id || r.city_id].filter(Boolean) as string[];
  const names = ids
    .map((id) => cities.find((c) => c.id === id)?.name)
    .filter(Boolean) as string[];
  return { ids, names };
}

export function DaySection({
  day, title, subtitle, count, defaultOpen = true, children,
}: {
  day: number; title: string; subtitle?: string; count: number;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 text-left">
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">Day {day} — {title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
        </div>
        {count > 0 && (
          <Badge variant="secondary" className="text-[10px]">{count} selected</Badge>
        )}
      </button>
      {open && <div className="p-3 border-t bg-background/50 space-y-2">{children}</div>}
    </Card>
  );
}

export function dayTitleFor(r: RoutingDay, cities: { id: string; name: string }[], isLast: boolean) {
  const { names } = dayDestInfo(r, cities);
  if (isLast && names.length === 0) return "Departure";
  return names.length > 0 ? names.join(" + ") : "Unassigned";
}

export function dayAllCities(
  r: RoutingDay,
  cities: CityRef[],
  fromDefault: string,
): CityRef[] {
  const out: CityRef[] = [];
  const push = (id: string | undefined, nameFallback?: string) => {
    if (id) {
      const c = cities.find((x) => x.id === id);
      if (c && !out.some((o) => o.id === c.id)) out.push(c);
      return;
    }
    if (nameFallback) {
      const c = cities.find((x) => x.name === nameFallback);
      if (c && !out.some((o) => o.id === c.id)) out.push(c);
    }
  };
  push(undefined, r.from_city ?? fromDefault);
  const toIds = (r.to_city_ids && r.to_city_ids.length > 0) ? r.to_city_ids : (r.to_city_id ? [r.to_city_id] : []);
  toIds.forEach((id) => push(id));
  push(r.city_id);
  return out;
}

export function CustomAdd({ label, onAdd }: { label: string; onAdd: (name: string, amount: number) => void }) {
  const [n, setN] = useState(""); const [a, setA] = useState(0);
  return (
    <div className="flex gap-2 items-end pt-1">
      <div className="flex-1"><Label className="text-xs">{label}</Label><Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Name" /></div>
      <div className="w-32"><Label className="text-xs">Amount</Label><Input type="number" value={a} onChange={(e) => setA(parseFloat(e.target.value) || 0)} /></div>
      <Button size="sm" onClick={() => { if (n && a > 0) { onAdd(n, a); setN(""); setA(0); } }}>Add</Button>
    </div>
  );
}

export const WIZARD_HOTEL_CATEGORIES = [
  "Home Stay",
  "Excellent Budget",
  "3 Star",
  "3 Star Deluxe",
  "4 Star",
  "4 Star Superior",
  "5 Star",
  "5 Star Deluxe",
  "Heritage",
  "Experiential",
] as const;

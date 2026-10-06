import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Route, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-mock";
import { useDB } from "@/lib/mock-store";
import {
  addProgram,
  nextProgramCode,
  type ProgramRoutingRow,
  type SavedProgram,
} from "@/lib/wizard/agents-store";

interface RoutingDraft extends ProgramRoutingRow {
  from_city: string;
  destination_city: string;
  overnight_city: string;
}

const makeDays = (count: number, existing: RoutingDraft[] = []): RoutingDraft[] =>
  Array.from(
    { length: count },
    (_, index) =>
      existing[index] || {
        day: index + 1,
        from_city: "",
        destination_city: "",
        overnight_city: "",
        program_text: "",
      },
  ).map((row, index) => ({ ...row, day: index + 1 }));

export function ProgramFormDialog({
  open,
  onOpenChange,
  programs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programs: SavedProgram[];
}) {
  const navigate = useNavigate();
  const user = useAuth();
  const db = useDB();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nights, setNights] = useState(4);
  const [departureCity, setDepartureCity] = useState("");
  const [categories, setCategories] = useState("");
  const [routingSummary, setRoutingSummary] = useState("");
  const [routing, setRouting] = useState<RoutingDraft[]>(() => makeDays(5));

  useEffect(() => {
    if (!open) return;
    setCode(nextProgramCode(programs));
    setName("");
    setNights(4);
    setDepartureCity("");
    setCategories("");
    setRoutingSummary("");
    setRouting(makeDays(5));
  }, [open, programs]);

  const cityNames = useMemo(
    () => Array.from(new Set(db.cities.map((city) => city.name))).sort(),
    [db.cities],
  );

  const changeNights = (value: number) => {
    const next = Math.min(30, Math.max(0, Number.isFinite(value) ? value : 0));
    setNights(next);
    setRouting((current) => makeDays(next + 1, current));
  };

  const updateDay = (index: number, patch: Partial<RoutingDraft>) =>
    setRouting((current) =>
      current.map((day, dayIndex) => (dayIndex === index ? { ...day, ...patch } : day)),
    );

  const removeDay = (index: number) => {
    if (routing.length <= 1) return;
    const next = routing.filter((_, dayIndex) => dayIndex !== index);
    setRouting(makeDays(next.length, next));
    setNights(Math.max(0, next.length - 1));
  };

  const addDay = () => {
    setRouting((current) => makeDays(current.length + 1, current));
    setNights(routing.length);
  };

  const save = () => {
    const cleanCode = (code || nextProgramCode(programs)).trim().toUpperCase();
    if (!name.trim()) return toast.error("Enter a Program Name.");
    if (!cleanCode) return toast.error("Enter or generate a Program Code.");
    if (programs.some((program) => program.code.toUpperCase() === cleanCode)) {
      return toast.error(`${cleanCode} already exists. Please use a different Program Code.`);
    }
    const hasRouting = routing.some(
      (day) =>
        day.from_city.trim() ||
        day.destination_city.trim() ||
        day.overnight_city.trim() ||
        day.program_text.trim(),
    );
    if (!hasRouting) return toast.error("Add at least one city or itinerary detail.");

    const cities = Array.from(
      new Set(
        routing
          .flatMap((day) => [day.from_city, day.destination_city, day.overnight_city])
          .map((city) => city.trim())
          .filter(Boolean),
      ),
    );
    const summary =
      routingSummary.trim() ||
      routing
        .map((day) => day.overnight_city || day.destination_city)
        .filter(Boolean)
        .filter((city, index, values) => index === 0 || city !== values[index - 1])
        .join(" → ");
    const created = addProgram({
      id: cleanCode,
      code: cleanCode,
      name: name.trim(),
      nights,
      days: routing.length,
      duration_label: `${nights} Nights & ${routing.length} Days`,
      routing_summary: summary,
      routing: routing.map((day, index) => ({
        day: index + 1,
        from_city: day.from_city.trim() || undefined,
        destination_city: day.destination_city.trim() || undefined,
        overnight_city: day.overnight_city.trim() || null,
        program_text: day.program_text.trim(),
      })),
      cities,
      categories: categories
        .split(",")
        .map((category) => category.trim())
        .filter(Boolean),
      departure_city: departureCity.trim() || undefined,
      travel_modes: [],
      inclusions: [],
      exclusions: [],
      source: "Manual",
      status: "Active",
      created_by: user?.name || "Unknown",
    });
    toast.success(`${created.code} · ${created.name} added to Program Master.`);
    onOpenChange(false);
    navigate({ to: "/routing-programs/$id", params: { id: created.id } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-teal-600" /> Create New Routing / Itinerary
          </DialogTitle>
          <DialogDescription>
            Build a reusable day-wise program without rates. It will immediately become available in
            the Quotation Builder.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Program Code</Label>
            <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
            <p className="text-xs text-muted-foreground">Editable auto-generated code</p>
          </div>
          <div className="space-y-1.5 xl:col-span-2">
            <Label>Program Name *</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Malwa Heritage & Jyotirlinga Trail"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nights</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={nights}
              onChange={(event) => changeNights(Number(event.target.value))}
            />
            <p className="text-xs text-muted-foreground">{routing.length} itinerary days</p>
          </div>
          <div className="space-y-1.5">
            <Label>Departure / Ex-city</Label>
            <Input
              list="program-city-options"
              value={departureCity}
              onChange={(event) => setDepartureCity(event.target.value)}
              placeholder="e.g. Indore"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categories</Label>
            <Input
              value={categories}
              onChange={(event) => setCategories(event.target.value)}
              placeholder="Heritage, Pilgrimage"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Routing Summary</Label>
            <Input
              value={routingSummary}
              onChange={(event) => setRoutingSummary(event.target.value)}
              placeholder="Optional — automatically created from the day-wise route"
            />
          </div>
        </div>

        <datalist id="program-city-options">
          {cityNames.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Day-wise itinerary</h3>
              <p className="text-xs text-muted-foreground">
                Add routing cities, overnight stays and the itinerary narrative for each day.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addDay}>
              <Plus className="mr-1 h-4 w-4" /> Add Day
            </Button>
          </div>

          {routing.map((day, index) => (
            <div key={day.day} className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-teal-700">Day {day.day}</p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={routing.length <= 1}
                  onClick={() => removeDay(index)}
                  aria-label={`Remove Day ${day.day}`}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Input
                    list="program-city-options"
                    value={day.from_city}
                    onChange={(event) => updateDay(index, { from_city: event.target.value })}
                    placeholder="Starting city"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Destination / Visit</Label>
                  <Input
                    list="program-city-options"
                    value={day.destination_city}
                    onChange={(event) => updateDay(index, { destination_city: event.target.value })}
                    placeholder="Primary destination"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Overnight City</Label>
                  <Input
                    list="program-city-options"
                    value={day.overnight_city}
                    onChange={(event) => updateDay(index, { overnight_city: event.target.value })}
                    placeholder={
                      index === routing.length - 1 ? "Optional on departure day" : "Stay city"
                    }
                  />
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <Label>Itinerary Details</Label>
                  <Textarea
                    value={day.program_text}
                    onChange={(event) => updateDay(index, { program_text: event.target.value })}
                    placeholder="Arrival, transfers, sightseeing, activities and other itinerary details…"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>
            <Save className="mr-2 h-4 w-4" /> Save Routing & Program
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

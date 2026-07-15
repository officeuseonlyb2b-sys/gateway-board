import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Plus, Search, Upload, Wifi, Waves, Building2, X, Download, Loader2, FileWarning, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useDB, HOTEL_CATEGORIES, type HotelCategory } from "@/lib/mock-store";
import { useAuth } from "@/lib/auth-mock";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CategoryBadge } from "@/components/CategoryBadge";
import { HotelFormDialog } from "@/components/HotelFormDialog";
import { importExcel, exportExcel, downloadErrorLog, type ImportSummary } from "@/lib/excel";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/hotels/")({
  head: () => ({ meta: [{ title: "Hotels — MP Tourism Hub" }] }),
  component: HotelsListPage,
});

function HotelsListPage() {
  const data = useDB();
  const user = useAuth();
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [catFilters, setCatFilters] = useState<HotelCategory[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setImporting(true); setSummary(null); setProgress({ done: 0, total: 0 });
    try {
      const result = await importExcel(file, (p) => setProgress(p));
      setSummary(result);
      toast.success(`Import complete — ${result.plansCreated} rate plans created.`);
      notify.success(
        "Import Complete",
        `Imported ${result.hotelsAdded} hotels, ${result.roomsAdded} rooms, ${result.plansCreated} rate plans.`,
        "/hotels", "import",
      );
      if (result.errors.length > 0) {
        notify.warning(
          "Import Had Errors",
          `${result.errors.length} row(s) failed during import. Review and retry.`,
          "/hotels", "import",
        );
      }
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
      notify.alert("Import Failed", (err as Error).message, undefined, "import");
    } finally {
      setImporting(false);
    }
  }

  const rows = useMemo(() => {
    return data.hotels
      .filter((h) => (cityFilter === "all" ? true : h.city_id === cityFilter))
      .filter((h) => (catFilters.length === 0 ? true : catFilters.includes(h.hotel_category)))
      .filter((h) => (search.trim() ? h.name.toLowerCase().includes(search.trim().toLowerCase()) : true))
      .map((h) => {
        const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
        const plans = rooms.flatMap((r) => data.rate_plans.filter((p) => p.room_category_id === r.id));
        return {
          ...h,
          city: data.cities.find((c) => c.id === h.city_id)?.name ?? "—",
          roomCount: rooms.length,
          planCount: plans.length,
        };
      });
  }, [data, search, cityFilter, catFilters]);

  function toggleCat(c: HotelCategory) {
    setCatFilters((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hotels</h1>
          <p className="text-sm text-muted-foreground mt-1">{data.hotels.length} hotels across {new Set(data.hotels.map((h) => h.city_id)).size} cities.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => exportExcel()}>
            <Download className="h-4 w-4 mr-2" /> Export to Excel
          </Button>
          <Button variant="outline" onClick={() => { setSummary(null); setProgress(null); setImportOpen(true); }}>
            <Upload className="h-4 w-4 mr-2" /> Import from Excel/CSV
          </Button>
          <HotelFormDialog trigger={
            <Button><Plus className="h-4 w-4 mr-2" /> Add New Hotel</Button>
          } />
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by hotel name…" className="pl-9"
            />
          </div>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {data.cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {HOTEL_CATEGORIES.map((c) => {
            const active = catFilters.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-border text-muted-foreground"
                }`}
              >
                {c}
              </button>
            );
          })}
          {catFilters.length > 0 && (
            <button onClick={() => setCatFilters([])} className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="font-medium py-3 px-4">Hotel</th>
                <th className="font-medium py-3 px-4">City</th>
                <th className="font-medium py-3 px-4">Category</th>
                <th className="font-medium py-3 px-4 text-center">Amenities</th>
                <th className="font-medium py-3 px-4 text-center">Rooms</th>
                <th className="font-medium py-3 px-4 text-center">Plans</th>
                <th className="font-medium py-3 px-4">Updated</th>
                <th className="font-medium py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((h) => (
                <tr key={h.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                  <td className="py-3 px-4">
                    <Link to="/hotels/$id" params={{ id: h.id }} className="font-medium hover:text-primary">
                      {h.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{h.contact_name}</div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{h.city}</td>
                  <td className="py-3 px-4"><CategoryBadge category={h.hotel_category} /></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      {h.has_wifi && <Wifi className="h-4 w-4 text-teal" aria-label="Wi-Fi" />}
                      {h.has_pool && <Waves className="h-4 w-4 text-sky-600" aria-label="Pool" />}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center tabular-nums">{h.roomCount}</td>
                  <td className="py-3 px-4 text-center tabular-nums">{h.planCount}</td>
                  <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(h.updated_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <HotelFormDialog
                      hotel={data.hotels.find((x) => x.id === h.id)}
                      trigger={
                        <Button size="sm" variant="outline">
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="py-16 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
                    <div className="mt-3 font-medium">No hotels found</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {data.hotels.length === 0 ? "Add your first hotel to get started." : "Try adjusting your filters."}
                    </div>
                    {data.hotels.length === 0 && (
                      <div className="mt-4">
                        <HotelFormDialog trigger={<Button><Plus className="h-4 w-4 mr-2" /> Add Hotel</Button>} />
                      </div>
                    )}
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {user?.role !== "admin" && (
        <p className="text-xs text-muted-foreground">
          Signed in as Staff — you can edit rates but not delete hotels or manage users.
        </p>
      )}

      <Dialog open={importOpen} onOpenChange={(v) => { if (!importing) setImportOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import Hotels &amp; Rates from Excel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!summary && !importing && (
              <>
                <p className="text-sm text-muted-foreground">Upload a .xlsx or .csv file with columns:</p>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono overflow-x-auto">
                  City, Hotel Category, Hotel Name, Room Category, Validity, Rates Standard Meal Plan, Double, Single, Extra Bed, CWB, Lunch, Dinner, Extra Breakfast, X'mas Sup, N'year Sup, Rates From, Email ID, Wifi, Pool, Remarks
                </div>
                <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted/30 cursor-pointer transition-colors">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <div className="mt-2 text-sm font-medium">Click to upload</div>
                  <div className="text-xs text-muted-foreground mt-1">.xlsx or .csv up to 10MB</div>
                  <input
                    ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                </label>
              </>
            )}

            {importing && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Importing row {progress?.done ?? 0} of {progress?.total ?? "…"}</span>
                </div>
                <Progress value={progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0} />
              </div>
            )}

            {summary && (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
                  <div className="font-semibold text-emerald-800 mb-1">Import complete</div>
                  <div className="text-emerald-900/80 text-xs space-y-0.5">
                    <div>{summary.hotelsAdded} hotels added</div>
                    <div>{summary.roomsAdded} rooms added</div>
                    <div>{summary.plansCreated} rate plans created</div>
                    <div>{summary.errors.length} errors</div>
                  </div>
                </div>
                {summary.errors.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => downloadErrorLog(summary)}>
                    <FileWarning className="h-4 w-4 mr-2" /> Download error log ({summary.errors.length})
                  </Button>
                )}
                <Button className="w-full" onClick={() => { setImportOpen(false); setSummary(null); }}>Done</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

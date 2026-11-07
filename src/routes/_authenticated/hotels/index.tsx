import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Plus,
  Search,
  Upload,
  Wifi,
  Waves,
  Building2,
  X,
  Download,
  Loader2,
  FileWarning,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  db,
  useDB,
  HOTEL_CATEGORIES,
  LEGACY_DB_CACHE_KEY,
  type HotelCategory,
} from "@/lib/mock-store";
import { getMasterSyncState, persistMastersAndWait, pullMasters, subscribeMasterSync } from "@/lib/masters-remote";
import { useAccessProfile } from "@/lib/crm/access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryBadge } from "@/components/CategoryBadge";
import { HotelFormDialog } from "@/components/HotelFormDialog";
import {
  importExcel,
  previewExcel,
  exportExcel,
  downloadErrorLog,
  type ImportPreview,
  type ImportSummary,
} from "@/lib/excel";
import { notify } from "@/lib/notify";
import { SKIP_BROCHURE_HOTEL_MAPPING } from "@/lib/hotel-identity-reconciliation";
import { planHotelMasterRecovery, verifyHotelMasterRecoveryBackup, type HotelMasterRecoveryBackup, type HotelMasterRecoveryMerge } from "@/lib/hotel-master-recovery";

export const Route = createFileRoute("/_authenticated/hotels/")({
  head: () => ({ meta: [{ title: "Hotels — MP Tourism Hub" }] }),
  component: HotelsListPage,
});

function HotelsListPage() {
  const data = useDB();
  const masterSyncState = useSyncExternalStore(
    subscribeMasterSync,
    getMasterSyncState,
    getMasterSyncState,
  );
  const access = useAccessProfile();
  const canDelete = access.accountReady && access.role === "Super Admin";
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [catFilters, setCatFilters] = useState<HotelCategory[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [brochureHotelMappings, setBrochureHotelMappings] = useState<Record<string, string>>({});
  const [includeSupplierRates, setIncludeSupplierRates] = useState(true);
  const [recoveryPreview, setRecoveryPreview] = useState<HotelMasterRecoveryMerge | null>(null);
  const [recoveryBackup, setRecoveryBackup] = useState<HotelMasterRecoveryBackup | null>(null);
  const [recoveryInProgress, setRecoveryInProgress] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recoveryFileRef = useRef<HTMLInputElement>(null);

  async function exportRecoveryBackup(): Promise<boolean> {
    if (masterSyncState.status !== "ready" && masterSyncState.status !== "empty") {
      toast.error("Wait for the shared Hotel Master to finish loading before exporting a recovery backup.");
      return false;
    }
    setBackupInProgress(true);
    try {
      const current = db.get();
      let legacyRaw: string | null = null;
      let legacyParsed: unknown = null;
      try {
        legacyRaw = window.localStorage.getItem(LEGACY_DB_CACHE_KEY);
        legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : null;
      } catch {
        // Preserve the exact raw cache text in the backup even if it is not parseable.
      }
      const sha256 = async (value: string) => {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      };
      const currentJson = JSON.stringify(current);
      const backup = {
        format: "mp-tourism-hotel-master-recovery",
        format_version: 1,
        exported_at: new Date().toISOString(),
        source: "authenticated shared master snapshot",
        master_sync_status: masterSyncState.status,
        counts: {
          cities: current.cities.length,
          hotels: current.hotels.length,
          room_categories: current.room_categories.length,
          rate_plans: current.rate_plans.length,
          brochure_hotel_rates: current.brochure_hotel_rates?.length ?? 0,
        },
        current_shared_master_sha256: await sha256(currentJson),
        hotel_master: current,
        legacy_browser_cache: legacyRaw === null
          ? null
          : {
              key: LEGACY_DB_CACHE_KEY,
              sha256: await sha256(legacyRaw),
              parsed: legacyParsed,
              raw: legacyRaw,
            },
      };
            await verifyHotelMasterRecoveryBackup(backup);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hotel-master-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Recovery backup downloaded: ${current.hotels.length} hotels, ${current.room_categories.length} rooms and ${current.rate_plans.length} rate rows.`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? `Recovery backup failed: ${error.message}` : "Recovery backup failed.");
      return false;
    } finally {
      setBackupInProgress(false);
    }
  }

  async function previewRecoveryBackup(file?: File) {
    if (!file) return;
    if (!canDelete) {
      toast.error("Only a Super Admin can recover the shared Hotel Master.");
      return;
    }
    if (masterSyncState.status !== "ready" && masterSyncState.status !== "empty") {
      toast.error(`Hotel Master is ${masterSyncState.status}; recovery is blocked until the authenticated shared snapshot is available.`);
      return;
    }
    setRecoveryInProgress(true);
    try {
      const verified = await verifyHotelMasterRecoveryBackup(JSON.parse(await file.text()));
      const planned = planHotelMasterRecovery(db.get(), verified);
      setRecoveryBackup(verified);
      setRecoveryPreview(planned);
    } catch (error) {
      setRecoveryBackup(null);
      setRecoveryPreview(null);
      toast.error(error instanceof Error ? error.message : "Could not verify the Hotel Master recovery file.");
    } finally {
      setRecoveryInProgress(false);
    }
  }

  async function applyRecoveryBackup() {
    if (!recoveryBackup || !recoveryPreview || !canDelete) return;
    if (recoveryPreview.report.conflicts.length) {
      toast.error("Recovery is blocked because identity or rate conflicts require manual review.");
      return;
    }
    if (masterSyncState.status !== "ready" && masterSyncState.status !== "empty") {
      toast.error(`Hotel Master is ${masterSyncState.status}; no recovery data was written.`);
      return;
    }
    const summary = recoveryPreview.report;
    if (!summary.hotelsAdded && !summary.roomsAdded && !summary.supplierRatesAdded && !summary.brochureRatesAdded && !summary.citiesAdded) {
      toast.info("All verified recovery records are already present; no changes were needed.");
      return;
    }
    if (!window.confirm(`Merge ${summary.hotelsAdded} original-ID Hotel(s), ${summary.roomsAdded} Room(s), ${summary.supplierRatesAdded} supplier rate plan(s), and ${summary.brochureRatesAdded} Brochure period(s)? Existing IDs and records will not be overwritten.`)) return;
    setRecoveryInProgress(true);
    try {
      const backupCreated = await exportRecoveryBackup();
      if (!backupCreated) throw new Error("Recovery stopped: a fresh current-master backup was not created.");
      const currentPlan = planHotelMasterRecovery(db.get(), recoveryBackup);
      if (currentPlan.report.conflicts.length) throw new Error(`The shared master changed during review: ${currentPlan.report.conflicts[0]}`);
      db.mergeHotelRecovery(currentPlan.additions);
      await persistMastersAndWait(db.get());
      const restoredIds = recoveryBackup.hotel_master.hotels.map((hotel) => hotel.id);
      const missingAfterWrite = restoredIds.filter((id) => !db.get().hotels.some((hotel) => hotel.id === id));
      if (missingAfterWrite.length) throw new Error(`Post-save verification could not find ${missingAfterWrite.length} original Hotel ID(s).`);
      toast.success(`Recovery verified: ${currentPlan.report.hotelsAdded} original-ID Hotel(s), ${currentPlan.report.roomsAdded} room(s), and ${currentPlan.report.supplierRatesAdded} supplier rate plan(s) merged.`);
      setRecoveryPreview(null);
      setRecoveryBackup(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hotel Master recovery failed; existing records were not overwritten.");
    } finally {
      setRecoveryInProgress(false);
    }
  }

  async function handleFile(file: File) {
    setImporting(true);
    setSummary(null);
    setImportPreview(null);
    setPendingFile(file);
    setBrochureHotelMappings({});
    setProgress({ done: 0, total: 0 });
    try {
      const result = await previewExcel(file);
      setImportPreview(result);
      setIncludeSupplierRates(!result.brochureColumnsFound);
      toast.success(
        `Preview ready — ${result.totalRows} source rows read from ${result.sheetName}.`,
      );
    } catch (err) {
      setPendingFile(null);
      toast.error(`Preview failed: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  async function setBrochureHotelMapping(identityKey: string, value: string) {
    const next = { ...brochureHotelMappings, [identityKey]: value };
    setBrochureHotelMappings(next);
    if (!pendingFile) return;
    setImporting(true);
    try {
      setImportPreview(await previewExcel(pendingFile, { brochureHotelMappings: next }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh the Hotel ID reconciliation preview.");
    } finally {
      setImporting(false);
    }
  }

  async function commitImport() {
    if (!pendingFile) return;
    const brochureImport = Boolean(importPreview?.brochureColumnsFound);
    setImporting(true);
    setProgress({ done: 0, total: importPreview?.totalRows ?? 0 });
    try {
      if (brochureImport && includeSupplierRates) {
        throw new Error("Brochure-only import requires supplier-rate import to remain OFF.");
      }
      const before = db.get();
      const beforeMasterJson = JSON.stringify(before);
      const beforeHotelIds = new Set(before.hotels.map((hotel) => hotel.id));
      const beforeRoomIds = new Set(before.room_categories.map((room) => room.id));
      const beforeSupplierRates = JSON.stringify(before.rate_plans);
      if (brochureImport) {
        const backupCreated = await exportRecoveryBackup();
        if (!backupCreated) throw new Error("Import stopped: create/download the current Hotel Master recovery backup before applying any changes from this Brochure workbook.");
        const latestPreview = await previewExcel(pendingFile, { brochureHotelMappings });
        const reviewSignature = (preview: ImportPreview | null) => preview ? JSON.stringify({
          brochureHotelsMatched: preview.brochureHotelsMatched,
          brochurePeriodsToImport: preview.brochurePeriodsToImport,
          brochureRateConflicts: preview.brochureRateConflicts,
          brochureRateErrors: preview.brochureRateErrors,
          brochureUnresolvedHotelMatches: preview.brochureUnresolvedHotelMatches,
          identities: preview.brochureIdentityMatches.map(({ key, matchedHotelId, status }) => ({ key, matchedHotelId, status })),
        }) : "";
        if (JSON.stringify(db.get()) !== beforeMasterJson || reviewSignature(latestPreview) !== reviewSignature(importPreview)) {
          setImportPreview(latestPreview);
          throw new Error("The shared Hotel Master changed after preview. No import was applied; review the refreshed preview and confirm again.");
        }
      }
      const result = await importExcel(pendingFile, (p) => setProgress(p), { brochureHotelMappings, importSupplierRates: includeSupplierRates });
      if (brochureImport) {
        await persistMastersAndWait(db.get());
        await pullMasters();
        const syncAfterReadback = getMasterSyncState();
        const persisted = db.get();
        const hotelIdsUnchanged = persisted.hotels.length === beforeHotelIds.size &&
          persisted.hotels.every((hotel) => beforeHotelIds.has(hotel.id));
        const roomIdsUnchanged = persisted.room_categories.length === beforeRoomIds.size &&
          persisted.room_categories.every((room) => beforeRoomIds.has(room.id));
        if (syncAfterReadback.status !== "ready") {
          throw new Error(`Brochure import was saved, but Supabase readback is ${syncAfterReadback.status}: ${syncAfterReadback.message}`);
        }
        if (!hotelIdsUnchanged || !roomIdsUnchanged || JSON.stringify(persisted.rate_plans) !== beforeSupplierRates) {
          throw new Error("Brochure-only readback detected a Hotel, Room, or supplier-plan change; review the shared master before any further import.");
        }
        if (persisted.brochure_hotel_rates.length !== before.brochure_hotel_rates.length + result.brochureRatesAdded) {
          throw new Error("Brochure period count after Supabase readback did not match the import summary.");
        }
      }
      setSummary(result);
      setImportPreview(null);
      setPendingFile(null);
      toast.success(
        `Import complete — ${result.brochureRatesAdded} Brochure periods added, ${result.brochureRatesUpdated} updated; ${result.plansCreated} supplier rate plans created, ${result.plansUpdated} updated.`,
      );
      notify.success(
        "Import Complete",
        `Hotels: ${result.hotelsAdded} created / ${result.hotelsUpdated} updated; rooms: ${result.roomsAdded} created; rate plans: ${result.plansCreated} created / ${result.plansUpdated} updated.`,
        "/hotels",
        "import",
      );
      if (result.errors.length > 0) {
        notify.warning(
          "Import Had Errors",
          `${result.errors.length} row(s) failed during import. Review and retry.`,
          "/hotels",
          "import",
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
      .filter((h) =>
        search.trim() ? h.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
      )
      .map((h) => {
        const rooms = data.room_categories.filter((r) => r.hotel_id === h.id);
        const plans = rooms.flatMap((r) =>
          data.rate_plans.filter((p) => p.room_category_id === r.id),
        );
        const offeringCategories = Array.from(
          new Set([h.hotel_category, ...plans.map((p) => p.hotel_category).filter(Boolean)]),
        ) as HotelCategory[];
        return {
          ...h,
          offeringCategories,
          city: data.cities.find((c) => c.id === h.city_id)?.name ?? "—",
          roomCount: rooms.length,
          planCount: plans.length,
        };
      })
      .filter((h) =>
        catFilters.length === 0
          ? true
          : catFilters.some((category) => h.offeringCategories.includes(category)),
      );
  }, [data, search, cityFilter, catFilters]);

  function toggleCat(c: HotelCategory) {
    setCatFilters((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  const visibleIds = rows.map((r) => r.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function toggleRow(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleAllVisible() {
    setSelected((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds])),
    );
  }
  function deleteSelected() {
    if (selected.length === 0) return;
    if (
      !confirm(
        `Delete ${selected.length} selected hotel(s)? This also removes their rooms and rate plans. This cannot be undone.`,
      )
    )
      return;
    selected.forEach((id) => db.deleteHotel(id));
    toast.success(`${selected.length} hotel(s) deleted.`);
    setSelected([]);
  }
  function deleteAll() {
    const count = data.hotels.length;
    if (count === 0) return;
    if (
      !confirm(
        `Delete ALL ${count} hotels? This also removes every room and rate plan. This cannot be undone.`,
      )
    )
      return;
    if (!confirm("Are you absolutely sure? This clears the entire hotels master.")) return;
    data.hotels.map((h) => h.id).forEach((id) => db.deleteHotel(id));
    toast.success("All hotels deleted.");
    setSelected([]);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hotels</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.hotels.length} hotels across {new Set(data.hotels.map((h) => h.city_id)).size}{" "}
            cities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <>
              <input ref={recoveryFileRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { void previewRecoveryBackup(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
              <Button variant="outline" disabled={recoveryInProgress || !["ready", "empty"].includes(masterSyncState.status)} onClick={() => recoveryFileRef.current?.click()} title="Merge missing Hotel Master records from a checksum-verified authenticated recovery snapshot; never overwrites existing IDs.">
                {recoveryInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Recover from Backup
              </Button>
            </>
          )}
          {selected.length > 0 && (
            <Button variant="destructive" onClick={deleteSelected}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete Selected ({selected.length})
            </Button>
          )}
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={data.hotels.length === 0}
            onClick={deleteAll}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete All
          </Button>
          <Button variant="outline" onClick={() => exportExcel()}>
            <Download className="h-4 w-4 mr-2" /> Export to Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => void exportRecoveryBackup()}
            disabled={backupInProgress || masterSyncState.status !== "ready"}
            title={masterSyncState.status !== "ready" ? "Wait for the authenticated shared Hotel Master to load." : "Download IDs, nested supplier and Brochure rates, metadata, legacy cache, and checksums."}
          >
            {backupInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {backupInProgress ? "Backing up…" : "Full Recovery Backup"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSummary(null);
              setProgress(null);
              setImportOpen(true);
            }}
          >
            <Upload className="h-4 w-4 mr-2" /> Import from Excel/CSV
          </Button>
          <HotelFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add New Hotel
              </Button>
            }
          />
        </div>
      </div>

      {data.hotels.length === 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Hotel Master currently shows 0 hotels.</strong> This can mean an empty shared record or a hydration/access problem; it does not prove records were permanently deleted. Do not import supplier rows or recreate Hotels until a verified recovery snapshot is reviewed. Sync status: {masterSyncState.status}{masterSyncState.message ? ` — ${masterSyncState.message}` : ""}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by hotel name…"
              className="pl-9"
            />
          </div>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {data.cities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
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
            <button
              onClick={() => setCatFilters([])}
              className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
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
                <th className="font-medium py-3 px-4 w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all hotels"
                  />
                </th>
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
                <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <Checkbox
                      checked={selected.includes(h.id)}
                      onCheckedChange={() => toggleRow(h.id)}
                      aria-label={`Select ${h.name}`}
                    />
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      to="/hotels/$id"
                      params={{ id: h.id }}
                      className="font-medium hover:text-primary"
                    >
                      {h.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{h.contact_name}</div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{h.city}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {h.offeringCategories.map((category) => (
                        <CategoryBadge key={category} category={category} />
                      ))}
                    </div>
                  </td>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-1"
                      title="Delete hotel"
                      onClick={() => {
                        if (
                          confirm(`Delete "${h.name}"? This also removes its rooms and rate plans.`)
                        ) {
                          db.deleteHotel(h.id);
                          setSelected((prev) => prev.filter((x) => x !== h.id));
                          toast.success("Hotel deleted.");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="py-16 text-center">
                      <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
                      <div className="mt-3 font-medium">No hotels found</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {data.hotels.length === 0
                          ? "Add your first hotel to get started."
                          : "Try adjusting your filters."}
                      </div>
                      {data.hotels.length === 0 && (
                        <div className="mt-4">
                          <HotelFormDialog
                            trigger={
                              <Button>
                                <Plus className="h-4 w-4 mr-2" /> Add Hotel
                              </Button>
                            }
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {!canDelete && (
        <p className="text-xs text-muted-foreground">
          Signed in as Staff — you can edit rates but not delete hotels or manage users.
        </p>
      )}

      <Dialog
        open={importOpen}
        onOpenChange={(v) => {
          if (!importing) setImportOpen(v);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Hotels &amp; Rates from Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!summary && !importing && !importPreview && (
              <>
                <p className="text-sm text-muted-foreground">
                  Upload a .xlsx or .csv file with columns:
                </p>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono overflow-x-auto">
                  City, Hotel Category, Hotel Name, Room Category, Validity, Rates Standard Meal
                  Plan, Double, Single, Extra Bed, CWB, Lunch, Dinner, Extra Breakfast, X'mas Sup,
                  N'year Sup, Rates From, Email ID, Wifi, Pool, Remarks
                </div>
                <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted/30 cursor-pointer transition-colors">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <div className="mt-2 text-sm font-medium">Click to upload</div>
                  <div className="text-xs text-muted-foreground mt-1">.xlsx or .csv up to 10MB</div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.csv,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
              </>
            )}

            {importing && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>
                    Importing row {progress?.done ?? 0} of {progress?.total ?? "…"}
                  </span>
                </div>
                <Progress
                  value={
                    progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0
                  }
                />
              </div>
            )}

            {importPreview && !importing && (
              <div className="space-y-3">
                <div className="rounded-md border p-4 text-sm">
                  <div className="font-semibold">Read-only import preview</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>{importPreview.totalRows} source rows read</div>
                    <div>{importPreview.hotelsMatched} hotels matched</div>
                    <div>{importPreview.newHotels} new hotels</div>
                    <div>{importPreview.newRooms} new room categories</div>
                    <div>{importPreview.newRateCombinations} new rate combinations</div>
                    <div>{importPreview.identicalDuplicates} identical duplicates</div>
                    <div>{importPreview.conflictingRows} conflicting rows</div>
                    <div>{importPreview.rejectedRows} rejected rows</div>
                    <div>{importPreview.brochureColumnsFound ? "Brochure columns found in Hotel Rates sheet" : "No Brochure columns; saved Brochure rates unchanged"}</div>
                    <div>{importPreview.brochureHotelsMatched} canonical Hotels matched for Brochure rates</div>
                    <div>{importPreview.brochurePeriodsToImport} Brochure periods to add/update</div>
                    <div>{importPreview.brochureRateConflicts} repeated-value / overlap conflicts</div>
                    <div>{importPreview.brochureRateErrors} Brochure rows needing review</div>
                    <div>{importPreview.brochureIdentityMatches.length} source Hotel identities reconciled</div>
                    <div>{importPreview.brochureUnresolvedHotelMatches} Hotel identities awaiting manual confirmation</div>
                  </div>
                </div>
                {importPreview.brochureIdentityMatches.length > 0 && (
                  <div className="space-y-2 rounded-md border p-3">
                    <div>
                      <div className="text-sm font-semibold">Canonical Hotel ID reconciliation</div>
                      <p className="text-xs text-muted-foreground">Exact current IDs are preferred. Stale IDs use a unique normalized City + Hotel Name match; ambiguous/missing matches must be mapped or explicitly skipped. No hotels will be created.</p>
                    </div>
                    <div className="max-h-72 overflow-auto rounded border text-xs">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Source ID</th><th className="p-2 text-left">Workbook Hotel</th><th className="p-2 text-left">Current Canonical Match</th><th className="p-2 text-left">Result / Confirmation</th></tr></thead>
                        <tbody className="divide-y">
                          {importPreview.brochureIdentityMatches.map((match) => {
                            const matchedHotel = data.hotels.find((hotel) => hotel.id === match.matchedHotelId);
                            const matchedCity = matchedHotel ? data.cities.find((city) => city.id === matchedHotel.city_id)?.name : "";
                            return <tr key={match.key}>
                              <td className="p-2 align-top font-mono">{match.sourceHotelId || "(blank)"}</td>
                              <td className="p-2 align-top">{match.sourceCity} · {match.sourceHotelName}<div className="text-muted-foreground">rows {match.rows.join(", ")}</div></td>
                              <td className="p-2 align-top">{matchedHotel ? <>{matchedCity} · {matchedHotel.name}<div className="font-mono text-muted-foreground">{matchedHotel.id}</div></> : "No canonical match selected"}</td>
                              <td className="min-w-52 p-2 align-top">
                                <div className="mb-1 font-medium">{match.status.replaceAll("_", " ")}</div>
                                {match.unresolved ? <select className="h-8 w-full rounded border bg-white px-2 text-[10px]" value={brochureHotelMappings[match.key] || ""} onChange={(event) => void setBrochureHotelMapping(match.key, event.target.value)}>
                                  <option value="">Select current Hotel / confirm before import…</option>
                                  {match.candidateHotelIds.map((candidateId) => {
                                    const candidate = data.hotels.find((hotel) => hotel.id === candidateId);
                                    const candidateCity = candidate ? data.cities.find((city) => city.id === candidate.city_id)?.name : "";
                                    return candidate ? <option key={candidate.id} value={candidate.id}>{candidateCity} · {candidate.name} · {candidate.id}</option> : null;
                                  })}
                                  <option value={SKIP_BROCHURE_HOTEL_MAPPING}>Skip this identity (do not import its Brochure periods)</option>
                                </select> : <span className="text-emerald-700">{match.status === "canonical_id" ? "Exact current ID" : "Unique City + Name"}</span>}
                              </td>
                            </tr>;
                          })}
                        </tbody>
                      </table>
                    </div>
                    {importPreview.brochurePeriodsToImport > 0 && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Commit will first download a full Hotel Master recovery backup, then apply only the confirmed Brochure period changes.</p>}
                  </div>
                )}
                {importPreview.brochureColumnsFound && (
                  <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                    <Checkbox checked={includeSupplierRates} onCheckedChange={(checked) => setIncludeSupplierRates(checked === true)} aria-label="Also import supplier Hotel Rates" />
                    <div>
                      <div className="text-xs font-semibold">Also import supplier Hotel Rates</div>
                      <p className="text-[10px] text-slate-600">Off by default for Brochure recovery. When enabled, the existing supplier import behavior also runs. Brochure-only recovery never writes supplier rates, rooms, hotel categories, or hotel records.</p>
                    </div>
                  </div>
                )}
                <div className="max-h-72 overflow-auto rounded-md border text-xs">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="p-2 text-left">Row</th>
                        <th className="p-2 text-left">Hotel / City</th>
                        <th className="p-2 text-left">Room / Plan / Validity</th>
                        <th className="p-2 text-left">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {importPreview.diagnostics.map((item) => (
                        <tr key={`${item.row}-${item.disposition}`}>
                          <td className="p-2 align-top">{item.row}</td>
                          <td className="p-2 align-top">
                            <div>{item.hotel || "—"}</div>
                            <div className="text-muted-foreground">
                              {item.city || "—"} / {item.category || "—"}
                            </div>
                          </td>
                          <td className="p-2 align-top">
                            <div>
                              {item.room} / {item.plan || "—"}
                            </div>
                            <div className="text-muted-foreground">{item.validity || "—"}</div>
                          </td>
                          <td className="p-2 align-top">
                            <div className="font-medium">{item.disposition}</div>
                            <div className="text-muted-foreground">{item.reason}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {includeSupplierRates && importPreview.conflictingRows > 0 && (
                  <p className="text-xs text-destructive">
                    Conflicting duplicate rows must be reviewed. Commit is disabled so existing
                    prices cannot be overwritten silently.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setImportPreview(null);
                      setPendingFile(null);
                    }}
                  >
                    Choose another file
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={(includeSupplierRates && importPreview.conflictingRows > 0) || importPreview.brochureUnresolvedHotelMatches > 0}
                    onClick={commitImport}
                  >
                    Commit reviewed import
                  </Button>
                </div>
              </div>
            )}

            {summary && (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
                  <div className="font-semibold text-emerald-800 mb-1">Import complete</div>
                  <div className="text-emerald-900/80 text-xs space-y-0.5">
                    <div>{summary.hotelsAdded} hotels created</div>
                    <div>{summary.hotelsUpdated} hotels updated</div>
                    <div>{summary.roomsAdded} room categories created</div>
                    <div>{summary.plansCreated} rate plans created</div>
                    <div>{summary.plansUpdated} rate plans updated</div>
                    <div>{summary.identicalDuplicates} identical duplicates ignored</div>
                    <div>{summary.conflictingRows} conflicts left unchanged</div>
                    <div>{summary.rateCellsImported} populated rate cells read</div>
                    <div>{summary.brochureRatesAdded} Brochure periods added</div>
                    <div>{summary.brochureRatesUpdated} Brochure periods updated</div>
                    <div>{summary.brochureRateConflicts} Brochure conflicts left unchanged</div>
                    <div>{summary.brochureRatesSkipped} Brochure periods skipped / unchanged</div>
                    <div>{summary.skippedRows} rows skipped</div>
                    <div>{summary.errors.length} row errors / missing fields</div>
                  </div>
                </div>
                {summary.errors.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => downloadErrorLog(summary)}>
                    <FileWarning className="h-4 w-4 mr-2" /> Download error log (
                    {summary.errors.length})
                  </Button>
                )}
                <Button
                  className="w-full"
                  onClick={() => {
                    setImportOpen(false);
                    setSummary(null);
                  }}
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(recoveryPreview && recoveryBackup)}
        onOpenChange={(open) => { if (!open && !recoveryInProgress) { setRecoveryPreview(null); setRecoveryBackup(null); } }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verify Hotel Master Recovery</DialogTitle>
          </DialogHeader>
          {recoveryPreview && recoveryBackup && <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Checksum verified authenticated snapshot from {new Date(recoveryPreview.report.exportedAt).toLocaleString()}. Existing records will not be overwritten; original IDs are retained.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded border p-2"><div className="text-[10px] text-muted-foreground">Backup Hotels</div><strong>{recoveryPreview.report.originalHotelCount}</strong></div>
              <div className="rounded border p-2"><div className="text-[10px] text-muted-foreground">Hotels to recover</div><strong>{recoveryPreview.report.hotelsAdded}</strong></div>
              <div className="rounded border p-2"><div className="text-[10px] text-muted-foreground">Already present</div><strong>{recoveryPreview.report.hotelsAlreadyPresent}</strong></div>
              <div className="rounded border p-2"><div className="text-[10px] text-muted-foreground">Rooms to recover</div><strong>{recoveryPreview.report.roomsAdded}</strong></div>
              <div className="rounded border p-2"><div className="text-[10px] text-muted-foreground">Supplier rates to recover</div><strong>{recoveryPreview.report.supplierRatesAdded}</strong></div>
              <div className="rounded border p-2"><div className="text-[10px] text-muted-foreground">Brochure periods to recover</div><strong>{recoveryPreview.report.brochureRatesAdded}</strong></div>
            </div>
            {recoveryPreview.report.conflicts.length > 0 ? <div className="max-h-48 overflow-auto rounded border border-amber-300 bg-amber-50 p-3 text-xs"><strong>Recovery blocked: resolve conflicts before applying</strong><ul className="mt-2 list-disc space-y-1 pl-5">{recoveryPreview.report.conflicts.map((conflict, index) => <li key={`${index}-${conflict}`}>{conflict}</li>)}</ul></div> : <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">No Hotel, Room, supplier-rate, City, or Brochure-period conflicts. A fresh backup of the current master will be downloaded before recovery.</p>}
            <DialogFooter>
              <Button variant="outline" disabled={recoveryInProgress} onClick={() => { setRecoveryPreview(null); setRecoveryBackup(null); }}>Cancel</Button>
              <Button disabled={recoveryInProgress || recoveryPreview.report.conflicts.length > 0 || !recoveryPreview.report.hotelsAdded} onClick={() => void applyRecoveryBackup()}>
                {recoveryInProgress && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm additive recovery
              </Button>
            </DialogFooter>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

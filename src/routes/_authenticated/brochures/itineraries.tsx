import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  CloudUpload,
  FileSpreadsheet,
  FileDown,
  FileText,
  ImagePlus,
  Link2,
  Map as MapIcon,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, useAuthLifecycle } from "@/lib/auth-mock";
import { parseItineraryWorkbook, type ItineraryImportPreview } from "@/lib/itinerary-import";
import { brochurePricingCoverage, lookupSavedBrochurePackagePrice, useBrochures, type PackagePriceResult, type RoomSharing } from "@/lib/brochures-store";
import { useDrafts } from "@/lib/drafts-store";
import { useSavedQuotes } from "@/lib/quotes-store";
import { useDB } from "@/lib/mock-store";
import { buildProgrammeRoutingRegistry, costedProgrammeChoices, type CostedProgrammeChoice } from "@/lib/brochure-routing-registry";
import { programmeRoutingFingerprint, quoteMatchesProgrammeRouting } from "@/lib/programme-routing-identity";
import {
  findImportDuplicate,
  bannerFileValidation,
  getItineraryBanner,
  hydrateItineraryFromProgramme,
  itineraryValidation,
  listItineraries,
  newItinerary,
  removeItineraryBanner,
  saveItinerary,
  saveItineraryBanner,
  searchProgrammes,
  toPortalPackagePayload,
  type ItineraryDay,
  type ItineraryRecord,
  type ManualSectionKey,
} from "@/lib/itineraries-store";
import type { SavedProgram } from "@/lib/wizard/agents-store";
import { listExplicitlySavedRoutingProgrammes } from "@/lib/itineraries-store";
import { createItineraryPdf, itineraryPdfFilename, type ItineraryPdfMode } from "@/lib/itinerary-pdf";
import { approvePortalBrochureSnapshot, getPortalBrochureSnapshot, publishItineraryToPortal, submitPortalBrochureSnapshot } from "@/lib/portal-publication";

export const Route = createFileRoute("/_authenticated/brochures/itineraries")({
  head: () => ({ meta: [{ title: "Itinerary Builder — MP Tourism Hub" }] }),
  validateSearch: (search: Record<string, unknown>): { programmeId?: string; quoteId?: string; brochureVersionId?: string; itineraryId?: string } => ({
    programmeId: typeof search.programmeId === "string" ? search.programmeId : undefined,
    quoteId: typeof search.quoteId === "string" ? search.quoteId : undefined,
    brochureVersionId: typeof search.brochureVersionId === "string" ? search.brochureVersionId : undefined,
    itineraryId: typeof search.itineraryId === "string" ? search.itineraryId : undefined,
  }),
  component: ItineraryMasterPage,
});

const inputClass = "h-9 bg-white text-sm";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-700";
const sectionTitles: Record<ManualSectionKey, string> = {
  highlights: "Highlights",
  inclusions: "Included Items",
  exclusions: "Excluded Items",
  facts: "Facts / Travel Information",
  notes: "Important Notes / Please Note",
};
const importContentFields = ["overview", "highlights", "inclusions", "exclusions", "facts", "notes", "days"] as const;
type ImportContentField = (typeof importContentFields)[number];
const importContentLabels: Record<ImportContentField, string> = {
  overview: "Overview",
  highlights: "Highlights",
  inclusions: "Inclusions",
  exclusions: "Exclusions",
  facts: "Facts",
  notes: "Notes",
  days: "Day-wise descriptions",
};

function ItineraryMasterPage() {
  const searchParams = Route.useSearch();
  const [programmes, setProgrammes] = useState<SavedProgram[]>([]);
  const costingDrafts = useDrafts();
  const quotes = useSavedQuotes();
  const brochures = useBrochures();
  const db = useDB();
  const user = useAuth();
  const authLifecycle = useAuthLifecycle();
  const actor = user?.name || "Unknown";
  const [records, setRecords] = useState<ItineraryRecord[]>([]);
  const [record, setRecord] = useState<ItineraryRecord>(() => newItinerary());
  const [hasSelection, setHasSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const [programmeSearch, setProgrammeSearch] = useState("");
  const [tab, setTab] = useState<"plan" | "content">("plan");
  const [bannerUrl, setBannerUrl] = useState("");
  const [importPreview, setImportPreview] = useState<ItineraryImportPreview | null>(null);
  const [importTarget, setImportTarget] = useState<ItineraryRecord | null>(null);
  const [importAction, setImportAction] = useState<"update" | "copy" | null>(null);
  const [replaceImportFields, setReplaceImportFields] = useState<ImportContentField[]>([]);
  const [copyCode, setCopyCode] = useState("");
  const [portalPreview, setPortalPreview] = useState(false);
  const [publishingPortal, setPublishingPortal] = useState(false);
  const [submittingSnapshot, setSubmittingSnapshot] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState("");
  const [attestationReference, setAttestationReference] = useState("");
  const [reviewerRemarks, setReviewerRemarks] = useState("");
  const [pricePax, setPricePax] = useState("");
  const [priceHotel, setPriceHotel] = useState("");
  const [priceTransport, setPriceTransport] = useState("");
  const [priceOccupancy, setPriceOccupancy] = useState<RoomSharing | "">("");
  const [priceDate, setPriceDate] = useState("");
  const bannerInput = useRef<HTMLInputElement>(null);
  const workbookInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const appliedSearchRef = useRef("");
  const exportPdf = async (preview = false, mode: ItineraryPdfMode = "internal") => {
    try {
      const banner = record.banner?.assetKey ? await getItineraryBanner(record.banner.assetKey) : undefined;
      const blob = await createItineraryPdf(record, banner, { mode, brochure: linkedPricingVersion, quote: selectedQuote });
      const url = URL.createObjectURL(blob);
      if (preview) window.open(url, "_blank", "noopener,noreferrer");
      else { const link = document.createElement("a"); link.href = url; link.download = `${mode}_${itineraryPdfFilename(record)}`; link.click(); }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate itinerary PDF."); }
  };

  useEffect(() => {
    let mounted = true;
    listItineraries()
      .then((items) => {
        if (!mounted) return;
        setRecords(items);
        if (items[0]) {
          setRecord(items[0]);
          setHasSelection(true);
        }
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load itinerary records."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!record.portalSnapshot?.id) return;
    let active = true;
    void getPortalBrochureSnapshot(record.portalSnapshot.id).then(async (server) => {
      if (!active) return;
      const refreshed = { ...record, portalSnapshot: { id: server.id, status: server.status, version: server.version, submittedAt: server.submittedAt, approvedAt: server.approvedAt } };
      await saveItinerary(refreshed); setRecord(refreshed); setRecords((items) => items.map((item) => item.id === refreshed.id ? refreshed : item));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [record.id, record.portalSnapshot?.id]);

  // Itinerary Builder links only the canonical records explicitly persisted by
  // Itinerary Master; the analytics catalogue must never masquerade as a
  // saved routing source.
  useEffect(() => {
    let active = true;
    const refresh = () => listExplicitlySavedRoutingProgrammes()
      .then((items) => active && setProgrammes(items))
      .catch((error: unknown) => active && toast.error(error instanceof Error ? error.message : "Could not load saved Itinerary Master routings."));
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setBannerUrl("");
    if (record.banner?.assetKey) {
      getItineraryBanner(record.banner.assetKey)
        .then((blob) => {
          if (!active || !blob) return;
          objectUrl = URL.createObjectURL(blob);
          setBannerUrl(objectUrl);
        })
        .catch(() => active && setBannerUrl(""));
    } else setBannerUrl("");
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record.id, record.banner?.assetKey]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return [...records]
      .filter((item) => (!needle || [item.title, item.code, item.route, item.programmeName, item.programmeCode].join(" ").toLocaleLowerCase().includes(needle)))
      .filter((item) => programmeFilter === "all" || item.programmeId === programmeFilter)
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter((item) => durationFilter === "all" || String(item.daysCount || "") === durationFilter)
      .sort((left, right) => sort === "title" ? left.title.localeCompare(right.title) : right.updatedAt.localeCompare(left.updatedAt));
  }, [records, search, programmeFilter, statusFilter, durationFilter, sort]);
  const selectedProgramme = programmes.find((programme) => programme.id === record.programmeId);
  const programmeRegistry = useMemo(
    () => buildProgrammeRoutingRegistry(programmes, quotes, brochures, costingDrafts, db.cities),
    [programmes, quotes, brochures, costingDrafts, db.cities],
  );
  const selectedRegistryEntry = programmeRegistry.find((entry) => entry.programme.id === record.programmeId);
  const programmeChoices = useMemo(
    () => costedProgrammeChoices(programmes, quotes, brochures, db.cities),
    [programmes, quotes, brochures, db.cities],
  );
  const programmeOptions = useMemo(
    () => searchProgrammes(programmes, programmeSearch),
    [programmes, programmeSearch],
  );
  const directlyLinkedVersion = brochures.find(
    (version) => version.id === record.brochureVersionId && version.programme_id === record.programmeId &&
      (!record.routingFingerprint || !version.route_fingerprint || version.route_fingerprint === record.routingFingerprint),
  );
  const compatiblePricingVersions = brochures.filter(
    (version) =>
      version.status !== "Draft" && version.status !== "Archived" &&
      version.programme_id === record.programmeId &&
      // A legacy snapshot without a fingerprint is accepted only where its
      // canonical Programme identity is exact. A mismatched fingerprint never
      // becomes linkable merely because its display name is similar.
      (!record.routingFingerprint || !version.route_fingerprint || version.route_fingerprint === record.routingFingerprint),
  ).sort((left, right) => right.version - left.version || right.updated_at.localeCompare(left.updated_at));
  const registryVersionMatches = Boolean(
    selectedRegistryEntry &&
      (!record.routingFingerprint || selectedRegistryEntry.routeFingerprint === record.routingFingerprint),
  );
  const linkedPricingVersion = directlyLinkedVersion ||
    (registryVersionMatches ? selectedRegistryEntry?.brochureVersion : undefined);
  const selectedQuote = quotes.find((quote) => quote.id === record.costingQuoteId) ||
    (linkedPricingVersion ? quotes.find((quote) => quote.id === linkedPricingVersion.source_quote_id) : undefined);
  const publishedPricingVersions = brochures.filter(
    (version) => version.status !== "Draft" && version.programme_id === record.programmeId &&
      (!record.routingFingerprint || !version.route_fingerprint || version.route_fingerprint === record.routingFingerprint),
  );
  const exactPublishedPricingVersions = publishedPricingVersions.flatMap((version) => {
    if (!record.routingFingerprint) return [];
    if (version.route_fingerprint === record.routingFingerprint) return [version];
    if (version.route_fingerprint || !selectedProgramme) return [];
    const sourceQuote = quotes.find((quote) => quote.id === version.source_quote_id);
    return sourceQuote && quoteMatchesProgrammeRouting(sourceQuote, selectedProgramme, db.cities)
      ? [{ ...version, route_fingerprint: record.routingFingerprint }]
      : [];
  });
  const linkedScenarios = linkedPricingVersion?.scenarios || [];
  const requestedTransport = linkedScenarios.find((scenario) => (scenario.transport_variation_id || scenario.transport) === priceTransport);
  const priceResult: PackagePriceResult = record.programmeId && record.routingFingerprint && pricePax && priceHotel && priceTransport && priceOccupancy && priceDate
    && linkedPricingVersion
    ? lookupSavedBrochurePackagePrice(linkedPricingVersion, {
        programme_id: record.programmeId,
        route_fingerprint: record.routingFingerprint,
        pax: Number(pricePax),
        hotel_category: priceHotel,
        transport_variation_id: requestedTransport?.transport_variation_id,
        transport: requestedTransport?.transport,
        occupancy: priceOccupancy,
        departure_date: priceDate,
      })
    : { available: false, reason: "PRICE_ON_REQUEST" };
  const latestImport = records.filter((item) => item.importIdentity && item.importedAt).sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""))[0];
  const validation = itineraryValidation(record, programmes);
  const linkedPricingCoverage = linkedPricingVersion ? brochurePricingCoverage(linkedPricingVersion) : undefined;
  const publishedPricingVersion = [...exactPublishedPricingVersions].sort((a, b) => b.version - a.version)[0];
  const autoCoverage = [
    Boolean(record.route),
    record.nights !== null && record.daysCount !== null,
    Boolean(record.startCity && record.endCity),
    record.days.length > 0,
  ].filter(Boolean).length;
  const manualCoverage = [
    Boolean(record.overview.trim()),
    Boolean(record.banner),
    record.highlights.length > 0,
    record.notes.length > 0,
  ].filter(Boolean).length;

  const update = <K extends keyof ItineraryRecord>(key: K, value: ItineraryRecord[K]) => {
    setRecord((current) => {
      const sourceKeys = ["title", "code", "nights", "daysCount", "startCity", "endCity", "route", "overview", "days", "highlights", "inclusions", "exclusions", "facts", "notes"] as const;
      const fieldSources = sourceKeys.includes(key as (typeof sourceKeys)[number])
        ? { ...current.fieldSources, [key]: "Manual" as const }
        : current.fieldSources;
      return { ...current, [key]: value, fieldSources };
    });
  };
  const startNew = () => {
    setRecord(newItinerary(undefined, actor));
    setHasSelection(false);
    setProgrammeSearch("");
    setTab("plan");
    setPortalPreview(false);
  };
  const openRecord = (item: ItineraryRecord) => {
    setRecord(item);
    setHasSelection(true);
    setProgrammeSearch("");
    setPortalPreview(false);
  };
  const focusRecord = (item: ItineraryRecord, nextTab: "plan" | "content", preview = false) => {
    openRecord(item);
    setTab(nextTab);
    setPortalPreview(preview);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const saveDraft = async (item = record) => {
    const duplicate = records.find((existing) => existing.id !== item.id && item.code.trim() && existing.code.trim().toLocaleLowerCase() === item.code.trim().toLocaleLowerCase());
    if (duplicate) {
      toast.error(`Code ${item.code} is already used by “${duplicate.title || "Untitled itinerary"}”. Choose a unique code.`);
      return false;
    }
    const previousRecord = records.find((existing) => existing.id === item.id);
    const saved: ItineraryRecord = {
      ...item,
      contentVersion: previousRecord ? Math.max(1, previousRecord.contentVersion || 1) + 1 : Math.max(1, item.contentVersion || 1),
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
      status: "Draft",
    };
    try {
      await saveItinerary(saved);
      const previousBanner = previousRecord?.banner?.assetKey;
      if (previousBanner && previousBanner !== item.banner?.assetKey) await removeItineraryBanner(previousBanner);
      setRecord(saved);
      setHasSelection(true);
      setRecords((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      toast.success("Itinerary draft saved.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save itinerary draft.");
      return false;
    }
  };
  const pushToPortal = async () => {
    if (validation.length) { toast.error("Resolve the publication validation issues first."); return; }
    if (!linkedPricingVersion || !["Published", "Ready for Review"].includes(linkedPricingVersion.status)) { toast.error("Link an exact saved Brochure pricing version before publishing."); return; }
    if (linkedPricingCoverage?.readiness !== "Ready") { toast.error("Published pricing coverage must be complete before publishing."); return; }
    if (record.portalSnapshot?.status !== "Approved") { toast.error(record.portalSnapshot ? `Portal approval is ${record.portalSnapshot.status}. A separately approved snapshot is required.` : "Submit this saved Brochure pricing snapshot for independent approval first."); return; }
    setPublishingPortal(true);
    try {
      const receipt = await publishItineraryToPortal(record, linkedPricingVersion, record.portalSnapshot.id);
      const published = { ...record, status: "Published" as const, portalPublication: { packageId: receipt.packageId, revision: receipt.version, url: receipt.url, status: receipt.status, publishedAt: new Date().toISOString() }, updatedAt: new Date().toISOString(), updatedBy: actor };
      await saveItinerary(published);
      setRecord(published); setRecords((current) => current.map((item) => item.id === published.id ? published : item));
      toast.success(`Published to Portal (v${receipt.version}): ${receipt.url}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Portal publication failed; nothing was reported as published."); }
    finally { setPublishingPortal(false); }
  };
  const submitSnapshot = async () => {
    if (!linkedPricingVersion || !["Published", "Ready for Review"].includes(linkedPricingVersion.status)) return toast.error("Select an exact saved Brochure version first.");
    if (linkedPricingCoverage?.readiness !== "Ready") return toast.error("Complete the saved Brochure pricing coverage before submission.");
    setSubmittingSnapshot(true);
    try { const server = await submitPortalBrochureSnapshot(linkedPricingVersion); const updated = { ...record, portalSnapshot: { id: server.id, status: server.status, version: server.version, submittedAt: server.submittedAt, approvedAt: server.approvedAt } }; await saveItinerary(updated); setRecord(updated); setRecords((items) => items.map((item) => item.id === updated.id ? updated : item)); toast.success(`Snapshot ${server.id} confirmed as ${server.status}.`); } catch (error) { toast.error(error instanceof Error ? error.message : "Snapshot submission failed."); } finally { setSubmittingSnapshot(false); }
  };
  const approveSnapshot = async () => {
    if (!record.portalSnapshot?.id) return;
    try { const server = await approvePortalBrochureSnapshot(record.portalSnapshot.id, verificationMethod, attestationReference, reviewerRemarks); const updated = { ...record, portalSnapshot: { ...record.portalSnapshot, status: server.status, version: server.version, approvedAt: server.approvedAt } }; await saveItinerary(updated); setRecord(updated); setRecords((items) => items.map((item) => item.id === updated.id ? updated : item)); toast.success("Snapshot independently approved."); } catch (error) { toast.error(error instanceof Error ? error.message : "Snapshot approval failed."); }
  };
  const uploadBanner = async (file?: File) => {
    if (!file) return;
    const invalidBanner = bannerFileValidation(file);
    if (invalidBanner) return toast.error(invalidBanner);
    const assetKey = `${record.id}:banner:${crypto.randomUUID?.() || Date.now()}`;
    try {
      await saveItineraryBanner(assetKey, file);
      update("banner", { assetKey, name: file.name, type: file.type, size: file.size });
      const url = URL.createObjectURL(file);
      setBannerUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url; });
      toast.success("Package banner uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not store banner image.");
    }
  };
  const clearBanner = async () => {
    update("banner", undefined);
    setBannerUrl("");
  };
  const handleWorkbook = async (file?: File) => {
    if (!file) return;
    try {
      setImportPreview(parseItineraryWorkbook(await file.arrayBuffer(), file.name));
      setImportTarget(null);
      setImportAction(null);
      setReplaceImportFields([]);
      setCopyCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read this workbook.");
    }
  };
  const confirmImport = async () => {
    if (!importPreview) return;
    const sourceCode = importPreview.data.code || "";
    const identity = importPreview.data.importIdentity || "";
    const duplicate = findImportDuplicate(records, identity, sourceCode);
    if (duplicate && !importAction) {
      setImportTarget(duplicate);
      return;
    }
    const target = importAction === "update" ? importTarget || undefined : undefined;
    if (target?.status === "Published") {
      toast.error("Published itineraries are protected. Create a separate editable draft with a new package code.");
      return;
    }
    const requestedCode = target ? target.code : (copyCode.trim() || sourceCode);
    if (importAction === "copy") {
      if (!copyCode.trim()) { toast.error("Enter a new unique package code for the separate copy."); return; }
      const codeTaken = records.some((item) => item.code.trim().toLocaleLowerCase() === copyCode.trim().toLocaleLowerCase());
      if (codeTaken) { toast.error(`Code ${copyCode.trim()} is already in use. Choose a unique code.`); return; }
    }
    const hasUnsavedContent = Boolean(record.title || record.overview || record.route || record.days.length || record.highlights.length || record.inclusions.length || record.exclusions.length || record.facts.length || record.notes.length || record.banner);
    if (!hasSelection && hasUnsavedContent && !window.confirm("Load this workbook into the current unsaved itinerary? Its unsaved edits will be replaced; saved itinerary records are never overwritten.")) return;
    const blank = newItinerary(undefined, actor);
    const base = target || blank;
    const useImported = <K extends ImportContentField>(key: K) => replaceImportFields.includes(key) || !base[key] || (Array.isArray(base[key]) && base[key].length === 0);
    const imported: ItineraryRecord = {
      ...base,
      ...(target ? {} : importPreview.data),
      id: target ? target.id : (!hasSelection ? record.id : blank.id),
      code: requestedCode,
      title: target && base.title ? base.title : (importPreview.data.title || base.title),
      nights: target && base.nights !== null ? base.nights : (importPreview.data.nights ?? base.nights),
      daysCount: target && base.daysCount !== null ? base.daysCount : (importPreview.data.daysCount ?? base.daysCount),
      startCity: target && base.startCity ? base.startCity : (importPreview.data.startCity || base.startCity),
      endCity: target && base.endCity ? base.endCity : (importPreview.data.endCity || base.endCity),
      route: target && base.route ? base.route : (importPreview.data.route || base.route),
      overview: useImported("overview") ? (importPreview.data.overview || "") : base.overview,
      highlights: useImported("highlights") ? (importPreview.data.highlights || []) : base.highlights,
      inclusions: useImported("inclusions") ? (importPreview.data.inclusions || []) : base.inclusions,
      exclusions: useImported("exclusions") ? (importPreview.data.exclusions || []) : base.exclusions,
      facts: useImported("facts") ? (importPreview.data.facts || []) : base.facts,
      notes: useImported("notes") ? (importPreview.data.notes || []) : base.notes,
      days: useImported("days") ? (importPreview.data.days || []) : base.days,
      status: "Draft",
      createdAt: target?.createdAt || blank.createdAt,
      createdBy: target?.createdBy || actor,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
      importedAt: new Date().toISOString(),
      sourcePricing: importPreview.sourcePricing,
      sourceHotelSupplements: importPreview.sourceHotelSupplements,
    };
    setRecord(imported);
    setHasSelection(Boolean(target));
    setProgrammeSearch("");
    setImportPreview(null);
    setImportTarget(null);
    setImportAction(null);
    setTab("plan");
    const saved = await saveDraft(imported);
    if (!saved) return;
    const reopened = (await listItineraries()).find((item) => item.id === imported.id);
    const importedDescriptions = importPreview.data.days?.filter((day) => day.description).length || 0;
    const persistedDescriptions = reopened?.days.filter((day) => day.description).length || 0;
    if (importedDescriptions && persistedDescriptions < importedDescriptions && useImported("days")) {
      toast.error("The draft was saved, but imported day descriptions could not be verified after reopening.");
      return;
    }
    toast.success(target ? "Existing itinerary draft updated and reopened successfully." : "Itinerary draft imported and reopened successfully.");
  };
  const editDay = (index: number, patch: Partial<ItineraryDay>) => update("days", record.days.map((day, currentIndex) => currentIndex === index ? { ...day, ...patch } : day));
  const updateList = (key: ManualSectionKey, index: number, value: string) => update(key, record[key].map((item, current) => current === index ? value : item));
  const addListItem = (key: ManualSectionKey) => update(key, [...record[key], ""]);
  const removeListItem = (key: ManualSectionKey, index: number) => update(key, record[key].filter((_, current) => current !== index));
  const lastImportLabel = latestImport?.importedAt ? new Date(latestImport.importedAt).toLocaleString() : "No imports yet";
  const selectProgramme = (
    programme: (typeof programmes)[number],
    preferredChoice?: CostedProgrammeChoice,
    baseRecord: ItineraryRecord = record,
  ) => {
    if (baseRecord.routingSnapshot && programme.id !== baseRecord.routingSnapshot.programmeId) {
      toast.error("This Builder record is linked to a saved routing. Create a separate itinerary to use a different Programme.");
      return;
    }
    const routingFingerprint = preferredChoice?.routeFingerprint || programmeRoutingFingerprint(programme);
    const registryEntry = programmeRegistry.find((entry) => entry.programme.id === programme.id);
    const candidateVersion = preferredChoice?.brochureVersion;
    const candidateQuote = preferredChoice?.quote || (candidateVersion
      ? quotes.find((quote) => quote.id === candidateVersion.source_quote_id)
      : registryEntry?.costingQuote);
    const versionMatches = Boolean(candidateVersion && candidateVersion.programme_id === programme.id &&
      (!candidateVersion.route_fingerprint || candidateVersion.route_fingerprint === routingFingerprint));
    const quoteMatches = Boolean(candidateQuote && quoteMatchesProgrammeRouting(candidateQuote, programme, db.cities));
    const linkedVersion = versionMatches && (candidateVersion?.route_fingerprint || quoteMatches) ? candidateVersion : undefined;
    const linkedQuote = linkedVersion && quoteMatches ? candidateQuote : undefined;
    const routingChanged = Boolean(baseRecord.programmeId && baseRecord.routingFingerprint && baseRecord.routingFingerprint !== routingFingerprint);
    const hasPublicEdits = Boolean(baseRecord.overview || baseRecord.banner || baseRecord.highlights.length || baseRecord.inclusions.length || baseRecord.exclusions.length || baseRecord.facts.length || baseRecord.notes.length || baseRecord.days.some((day) => day.description || day.sightseeing || day.activities || day.hotelNotes));
    if ((routingChanged || (baseRecord.programmeId && hasPublicEdits && baseRecord.programmeId !== programme.id)) && !window.confirm("This Programme/routing has a different saved snapshot. Existing manual/Excel content will be preserved; only Programme-derived routing fields are refreshed. Continue?")) return;

    const hydrated = hydrateItineraryFromProgramme(baseRecord, programme);
    const preserveTitle = Boolean(baseRecord.title && baseRecord.fieldSources?.title !== "Programme");
    const preserveCode = Boolean(baseRecord.code && baseRecord.fieldSources?.code !== "Programme");
    const preserveRoute = Boolean(baseRecord.route && (baseRecord.fieldSources?.route === "Excel" || baseRecord.fieldSources?.route === "Manual"));
    const preserveNights = baseRecord.fieldSources?.nights === "Excel" || baseRecord.fieldSources?.nights === "Manual";
    const preserveDaysCount = baseRecord.fieldSources?.daysCount === "Excel" || baseRecord.fieldSources?.daysCount === "Manual";
    const preserveStartCity = baseRecord.fieldSources?.startCity === "Excel" || baseRecord.fieldSources?.startCity === "Manual";
    const preserveEndCity = baseRecord.fieldSources?.endCity === "Excel" || baseRecord.fieldSources?.endCity === "Manual";
    const preserveDayRoutes = baseRecord.fieldSources?.days === "Excel" || baseRecord.fieldSources?.days === "Manual";
    const dayCount = Math.max(hydrated.days.length, preserveDayRoutes ? baseRecord.days.length : 0);
    const mergedDays = Array.from({ length: dayCount }, (_, index) => {
      const masterDay = hydrated.days[index];
      const currentDay = baseRecord.days.find((day) => day.day === index + 1) || (preserveDayRoutes ? baseRecord.days[index] : undefined);
      if (!masterDay) return currentDay || baseRecord.days[index]!;
      if (!currentDay) return masterDay;
      return {
        ...masterDay,
        title: currentDay.title || masterDay.title,
        route: preserveDayRoutes && currentDay.route ? currentDay.route : masterDay.route,
        cities: preserveDayRoutes && currentDay.cities.length ? currentDay.cities : masterDay.cities,
        overnightCity: preserveDayRoutes && currentDay.overnightCity ? currentDay.overnightCity : masterDay.overnightCity,
        meals: currentDay.meals || masterDay.meals,
        description: currentDay.description || masterDay.description,
        sightseeing: currentDay.sightseeing || masterDay.sightseeing,
        activities: currentDay.activities || masterDay.activities,
        hotelNotes: currentDay.hotelNotes || masterDay.hotelNotes,
      };
    });
    setRecord({
      ...hydrated,
      title: preserveTitle ? baseRecord.title : programme.name,
      code: preserveCode ? baseRecord.code : programme.code,
      nights: preserveNights ? baseRecord.nights : hydrated.nights,
      daysCount: preserveDaysCount ? baseRecord.daysCount : hydrated.daysCount,
      startCity: preserveStartCity ? baseRecord.startCity : hydrated.startCity,
      endCity: preserveEndCity ? baseRecord.endCity : hydrated.endCity,
      route: preserveRoute ? baseRecord.route : hydrated.route,
      overview: baseRecord.overview,
      banner: baseRecord.banner,
      days: mergedDays,
      highlights: baseRecord.highlights,
      inclusions: baseRecord.inclusions.length ? baseRecord.inclusions : [...(programme.inclusions || [])],
      exclusions: baseRecord.exclusions.length ? baseRecord.exclusions : [...(programme.exclusions || [])],
      facts: baseRecord.facts,
      notes: baseRecord.notes,
      costingQuoteId: linkedQuote?.id,
      brochureId: linkedVersion?.brochure_id,
      brochureVersionId: linkedVersion?.id,
      costingVersion: linkedQuote?.version ?? linkedVersion?.version,
      routingFingerprint,
      fieldSources: {
        ...hydrated.fieldSources,
        title: preserveTitle ? baseRecord.fieldSources?.title || "Manual" : "Programme",
        code: preserveCode ? baseRecord.fieldSources?.code || "Manual" : "Programme",
        route: preserveRoute ? baseRecord.fieldSources?.route : "Programme",
        overview: baseRecord.overview ? baseRecord.fieldSources?.overview || "Manual" : undefined,
        days: baseRecord.days.length ? baseRecord.fieldSources?.days || "Manual" : "Programme",
        highlights: baseRecord.highlights.length ? baseRecord.fieldSources?.highlights || "Excel" : undefined,
        inclusions: baseRecord.inclusions.length ? baseRecord.fieldSources?.inclusions || "Excel" : programme.inclusions?.length ? "Programme" : undefined,
        exclusions: baseRecord.exclusions.length ? baseRecord.fieldSources?.exclusions || "Excel" : programme.exclusions?.length ? "Programme" : undefined,
        facts: baseRecord.facts.length ? baseRecord.fieldSources?.facts || "Excel" : undefined,
        notes: baseRecord.notes.length ? baseRecord.fieldSources?.notes || "Excel" : undefined,
        startCity: preserveStartCity ? baseRecord.fieldSources?.startCity || "Manual" : "Programme",
        endCity: preserveEndCity ? baseRecord.fieldSources?.endCity || "Manual" : "Programme",
        nights: preserveNights ? baseRecord.fieldSources?.nights || "Manual" : "Programme",
        daysCount: preserveDaysCount ? baseRecord.fieldSources?.daysCount || "Manual" : "Programme",
      },
    });
    setProgrammeSearch(`${programme.code} · ${programme.name}${linkedVersion ? ` · Costing V${linkedVersion.version}` : ""}`);
  };

  useEffect(() => {
    if (loading) return;
    const key = [searchParams.itineraryId, searchParams.programmeId, searchParams.quoteId, searchParams.brochureVersionId].join("|");
    if (!key.replaceAll("|", "") || appliedSearchRef.current === key) return;
    appliedSearchRef.current = key;
    if (searchParams.itineraryId) {
      const saved = records.find((item) => item.id === searchParams.itineraryId);
      if (saved) {
        setRecord(saved);
        setHasSelection(true);
      }
      return;
    }
    if (searchParams.programmeId) {
      const programme = programmes.find((item) => item.id === searchParams.programmeId);
      if (!programme) {
        toast.error("This canonical Programme is no longer available.");
        return;
      }
      const choice = searchParams.quoteId
        ? programmeChoices.find((item) => item.programme.id === programme.id && item.quote.id === searchParams.quoteId && (!searchParams.brochureVersionId || item.brochureVersion.id === searchParams.brochureVersionId))
        : undefined;
      const blank = newItinerary(undefined, actor);
      setRecord(blank);
      setHasSelection(false);
      selectProgramme(programme, choice, blank);
      setTab("plan");
    }
  }, [loading, searchParams, records, programmeChoices, programmeRegistry, programmes, actor]);

  return (
    <div className="min-h-full bg-slate-100/70 p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1700px]">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white text-slate-800 shadow-sm"><MapIcon className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Itinerary Builder</h1>
              <p className="text-xs text-slate-500 sm:text-sm">Create, link, and manage reusable brochure itineraries from Excel or manual entry.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input ref={workbookInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { void handleWorkbook(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
            <Button variant="outline" className="h-9 bg-white text-xs" onClick={() => void exportPdf(true)}><FileText className="mr-2 h-4 w-4" />Preview PDF</Button>
            <Button variant="outline" className="h-9 bg-white text-xs" onClick={() => void exportPdf()}><FileDown className="mr-2 h-4 w-4" />Download PDF</Button>
            <Button variant="outline" className="h-9 bg-white text-xs" onClick={() => void exportPdf(false, "customer")}>Customer PDF</Button>
            <Button variant="outline" className="h-9 bg-white text-xs" onClick={() => void exportPdf(false, "itinerary")}>Itinerary Only</Button>
            <Button variant="outline" className="h-9 bg-white text-xs" onClick={() => workbookInput.current?.click()}><Upload className="mr-2 h-4 w-4" />Import Excel / CSV</Button>
            <Button className="h-9 text-xs" onClick={startNew}><Plus className="mr-2 h-4 w-4" />New Itinerary</Button>
          </div>
        </header>

        {false && <>
        <section className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <SummaryCard icon={<BookOpen className="h-4 w-4" />} label="Total Itineraries" value={String(records.length)} />
          <SummaryCard icon={<Link2 className="h-4 w-4" />} label="Linked Programmes" value={String(new Set(records.map((item) => item.programmeId).filter(Boolean)).size)} />
          <SummaryCard icon={<FileText className="h-4 w-4" />} label="Drafts" value={String(records.filter((item) => item.status !== "Published").length)} />
          <SummaryCard icon={<CloudUpload className="h-4 w-4" />} label="Last Import" value={lastImportLabel} small />
        </section>

        <Card className="mb-3 p-2">
          <div className="grid gap-2 md:grid-cols-[minmax(210px,1.5fr)_repeat(4,minmax(130px,1fr))]">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className={`${inputClass} pl-9`} placeholder="Search itineraries by title, code or route..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <select className="h-9 rounded-md border border-input bg-white px-3 text-xs" value={programmeFilter} onChange={(event) => setProgrammeFilter(event.target.value)}><option value="all">All Programmes</option>{programmes.map((program) => <option key={program.id} value={program.id}>{program.name} · {program.code}</option>)}</select>
            <select className="h-9 rounded-md border border-input bg-white px-3 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All Statuses</option><option value="Routing Saved">Routing Saved</option><option value="Draft">Draft</option><option value="Published">Published</option></select>
            <select className="h-9 rounded-md border border-input bg-white px-3 text-xs" value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)}><option value="all">All Durations</option>{Array.from(new Set(records.map((item) => item.daysCount).filter((value): value is number => value !== null))).sort((a, b) => a - b).map((days) => <option key={days} value={days}>{days} Days</option>)}</select>
            <select className="h-9 rounded-md border border-input bg-white px-3 text-xs" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Sort by: Last Updated</option><option value="title">Sort by: Title</option></select>
          </div>
        </Card>

        <Card className="mb-3 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-left text-xs">
              <thead className="bg-slate-100 text-[10px] uppercase text-slate-600">
                <tr>
                  <th className="p-2">Itinerary / Package Name</th>
                  <th className="p-2">Linked Programme</th>
                  <th className="p-2">Content Status</th>
                  <th className="p-2">Last Edited</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const linkedProgramme = programmes.find((programme) => programme.id === item.programmeId);
                  const itineraryStatus = item.status === "Published"
                    ? "Published"
                    : item.status === "Routing Saved"
                      ? "Routing Saved / Draft"
                    : itineraryValidation(item, programmes).length
                      ? "Draft"
                      : "Ready";
                  return (
                    <tr key={item.id} className={`border-t align-top ${record.id === item.id && hasSelection ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                      <td className="min-w-48 p-2 font-semibold">{item.title || item.code || "Untitled itinerary"}<div className="text-[10px] font-normal text-slate-500">{item.code || "No package code"}</div></td>
                      <td className="p-2">{linkedProgramme?.name || item.programmeName || "Not linked"}<div className="text-[10px] text-slate-500">{linkedProgramme?.code || item.programmeCode || "—"}</div></td>
                      <td className="p-2"><Badge variant={itineraryStatus === "Published" || itineraryStatus === "Ready" ? "default" : "secondary"}>{itineraryStatus}</Badge></td>
                      <td className="whitespace-nowrap p-2 text-slate-500">{new Date(item.updatedAt).toLocaleString()}</td>
                      <td className="p-2"><div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => focusRecord(item, "content")}>View</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => focusRecord(item, "plan")}>Edit</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => focusRecord(item, "content", true)}>Preview</Button>
                      </div></td>
                    </tr>
                  );
                })}
                {loading && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Loading saved itinerary content…</td></tr>}
                {!loading && !filtered.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No matching saved itinerary content. Create a new itinerary or import a workbook to begin.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t px-3 py-2 text-[10px] text-slate-500">This Builder list contains saved package content and drafts only. Routing Master records are managed in Itinerary Master.</p>
        </Card>
        </>}

        <section className="mb-4 grid grid-cols-4 rounded-lg border bg-white p-3 text-center text-[11px] shadow-sm">
          {[Boolean(record.programmeId), Boolean(record.brochureVersionId), Boolean(record.overview && record.days.length), false].map((done, index) => <div key={index} className={`relative px-1 ${index ? "border-l" : ""}`}><div className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full font-bold ${done ? "bg-emerald-500 text-white" : index === [Boolean(record.programmeId), Boolean(record.brochureVersionId), Boolean(record.overview && record.days.length), false].findIndex(Boolean) ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>{done ? "✓" : index + 1}</div><div className="font-semibold">{["Link Programme", "Link Brochure Costing", "Add / Edit Content", "Push to Portal"][index]}</div></div>)}
        </section>
        <div ref={editorRef} className="grid items-start gap-3 xl:grid-cols-[minmax(0,2.25fr)_minmax(290px,0.9fr)]">
          <Card className="overflow-hidden p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2 border-b pb-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><MapIcon className="h-4 w-4" />{hasSelection && record.title ? `Edit Itinerary: ${record.title}` : "Create New Itinerary"}</h2>
              <Badge variant={record.status === "Published" ? "default" : "secondary"}>{record.status}</Badge>
            </div>

            <div className="grid gap-x-4 gap-y-3 md:grid-cols-6">
              <Field className="md:col-span-3" label={`Itinerary Title *${record.fieldSources?.title === "Programme" ? " · Programme" : " · Manual"}`}><Input className={inputClass} value={record.title} onChange={(event) => update("title", event.target.value)} placeholder="Enter itinerary title" /></Field>
              <Field className="md:col-span-3" label={`Code *${record.fieldSources?.code === "Programme" ? " · Programme" : " · Manual"}`}><Input className={inputClass} value={record.code} onChange={(event) => update("code", event.target.value)} placeholder="e.g. EXBHP03" /></Field>

              <Field className="md:col-span-3" label="Linked Programme"><Input className={inputClass} value={programmeSearch || (selectedProgramme ? `${selectedProgramme.code} · ${selectedProgramme.name}` : "")} onChange={(event) => setProgrammeSearch(event.target.value)} placeholder="Search saved routing name, code, city or route" /><select aria-label="Select canonical Programme" className="mt-1 h-8 w-full rounded-md border border-input bg-white px-2 text-xs" value={record.programmeId || ""} onChange={(event) => { const programme = programmes.find((item) => item.id === event.target.value); if (programme) selectProgramme(programme); }}><option value="">{programmeOptions.length ? "Select a saved routing…" : "No saved routings yet"}</option>{programmeOptions.map((programme) => { const entry = programmeRegistry.find((item) => item.programme.id === programme.id); const version = entry?.brochureVersion; return <option key={programme.id} value={programme.id}>{programme.code} · {programme.name} · {programme.duration_label} · {version ? `Costing V${version.version} · ${version.status}` : entry?.status || "No saved costing"}</option>; })}</select><span className="mt-1 block text-[10px] text-slate-500">Only routings explicitly saved to Itinerary Master are selectable. Pricing is optional for an editable itinerary draft.</span>{record.programmeId && !record.brochureVersionId && <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900">Programme linked · No matching saved Brochure Costing version. This itinerary draft remains editable and saveable.</span>}</Field>
              <Field className="md:col-span-3" label={`Duration · Nights ${record.fieldSources?.nights === "Programme" ? "Programme" : "Manual"} / Days ${record.fieldSources?.daysCount === "Programme" ? "Programme" : "Manual"}`}><div className="grid grid-cols-2 gap-2"><Input type="number" min="0" className={inputClass} aria-label="Duration nights" value={record.nights ?? ""} onChange={(event) => update("nights", event.target.value === "" ? null : Number(event.target.value))} placeholder="Nights" /><Input type="number" min="1" className={inputClass} aria-label="Duration days" value={record.daysCount ?? ""} onChange={(event) => update("daysCount", event.target.value === "" ? null : Number(event.target.value))} placeholder="Days" /></div><span className="mt-1 block text-[10px] text-slate-500">{record.programmeId ? "Auto-filled; editable when Programme data needs correction" : "Can be entered manually when not in Programme Master"}</span></Field>

              <Field className="md:col-span-3" label="Linked Brochure Costing *">
                <select aria-label="Select finalized Brochure Costing" className="h-9 w-full rounded-md border border-input bg-white px-2 text-xs" value={record.brochureVersionId || ""} disabled={!record.programmeId} onChange={(event) => {
                  const version = compatiblePricingVersions.find((item) => item.id === event.target.value);
                  setRecord((current) => version
                    ? { ...current, brochureId: version.brochure_id, brochureVersionId: version.id, costingQuoteId: version.source_quote_id, costingVersion: version.version, pricingValidity: { from: version.validity_from, till: version.validity_till }, pricingCoverage: { readiness: brochurePricingCoverage(version).readiness, warnings: [...version.validation_errors, ...(version.coverage_warnings || [])] } }
                    : { ...current, brochureId: undefined, brochureVersionId: undefined, costingQuoteId: undefined, costingVersion: undefined, pricingValidity: undefined, pricingCoverage: undefined });
                }}>
                  <option value="">{record.programmeId ? compatiblePricingVersions.length ? "Select finalized costing version…" : "No finalized Brochure Costing available" : "Select a Programme first"}</option>
                  {compatiblePricingVersions.map((version) => <option key={version.id} value={version.id}>{version.name} · V{version.version} · {version.validity_from} – {version.validity_till} · {brochurePricingCoverage(version).readiness}</option>)}
                </select>
                <span className="mt-1 block text-[10px] text-slate-500">{record.programmeId && !compatiblePricingVersions.length ? "No finalized Brochure Costing available for this Programme. Complete and save its Final Pricing Snapshot first." : "Select the exact immutable pricing version; pricing is never recalculated here."}</span>
              </Field>
              <Field className="md:col-span-2" label={`Start City *${record.fieldSources?.startCity === "Programme" ? " · Programme" : " · Manual"}`}><Input className={inputClass} value={record.startCity} onChange={(event) => update("startCity", event.target.value)} /></Field>
              <Field className="md:col-span-2" label={`End City *${record.fieldSources?.endCity === "Programme" ? " · Programme" : " · Manual"}`}><Input className={inputClass} value={record.endCity} onChange={(event) => update("endCity", event.target.value)} /></Field>
              <Field className="md:col-span-1" label="Popular"><select className="h-9 w-full rounded-md border border-input bg-white px-2 text-xs" value={record.popular ? "yes" : "no"} onChange={(event) => update("popular", event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select></Field>
              <Field className="md:col-span-1" label="Group only"><select className="h-9 w-full rounded-md border border-input bg-white px-2 text-xs" value={record.groupOnly ? "yes" : "no"} onChange={(event) => update("groupOnly", event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select></Field>

              <Field className="md:col-span-6" label={`Route / Circuit *${record.fieldSources?.route === "Programme" ? " · Programme" : " · Manual"}`}><Input className={inputClass} value={record.route} onChange={(event) => update("route", event.target.value)} placeholder="City → Destination → City" /></Field>
              <Field className="md:col-span-6" label={`Overview * · ${record.fieldSources?.overview || "Manual"}`}><Textarea className="min-h-21.5 resize-y bg-white text-sm leading-5" value={record.overview} onChange={(event) => update("overview", event.target.value)} placeholder="Write the package introduction shown on the portal. This remains separate from Programme details." /></Field>

              <div className="md:col-span-6">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2"><label className={labelClass + " mb-0"}>Package Banner Image *</label><span className="text-[10px] text-slate-500">One primary banner · JPG, PNG or WebP · Max 5 MB · Recommended 1920 × 600</span></div>
                <div className="grid gap-3 rounded-lg border bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_170px] sm:p-3">
                  <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-md border bg-white sm:aspect-16/5 sm:max-h-47.5">{bannerUrl ? <img src={bannerUrl} alt="Package banner preview" className="h-full max-h-47.5 w-full object-cover" /> : <div className="text-center text-slate-400"><ImagePlus className="mx-auto mb-2 h-7 w-7" /><p className="text-xs">Upload one landscape package banner</p></div>}</div>
                  <div className="flex flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center">
                    <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { void uploadBanner(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
                    <Button type="button" variant="outline" className="h-8 bg-white text-xs" onClick={() => bannerInput.current?.click()}><Upload className="mr-2 h-3.5 w-3.5" />{record.banner ? "Replace" : "Upload Image"}</Button>
                    {record.banner && <Button type="button" variant="ghost" className="h-8 text-xs text-red-700" onClick={() => void clearBanner()}><Trash2 className="mr-2 h-3.5 w-3.5" />Remove</Button>}
                    <span className="text-[10px] leading-4 text-slate-500">Stored as a separate IndexedDB asset; only its reference and metadata are saved with this itinerary.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex border-b">
              <button type="button" onClick={() => setTab("plan")} className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold ${tab === "plan" ? "border-primary text-primary" : "border-transparent text-slate-500"}`}><CalendarIcon />Itinerary Plan ({record.daysCount ?? record.days.length} Days)</button>
              <button type="button" onClick={() => setTab("content")} className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold ${tab === "content" ? "border-primary text-primary" : "border-transparent text-slate-500"}`}><FileText className="h-3.5 w-3.5" />Manual Content</button>
            </div>
            {tab === "plan" ? <div className="mt-2 overflow-x-auto rounded-md border">
              <table className="w-full min-w-195 text-left text-[11px]">
                <thead className="bg-slate-100 text-slate-600"><tr><th className="p-2">DAY</th><th className="p-2">TITLE / PLAN</th><th className="p-2">ROUTE / CITY</th><th className="p-2">MEALS</th><th className="p-2 text-right">ACTIONS</th></tr></thead>
                <tbody>{record.days.map((day, index) => <tr key={`${record.id}-day-${day.day}`} className="border-t align-top"><td className="p-2"><span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 font-semibold">Day {day.day}</span></td><td className="max-w-65 p-2"><div className="font-medium text-slate-800">{day.title || "Itinerary details to be completed"}</div><p className="line-clamp-2 whitespace-pre-wrap text-slate-500">{day.description}</p></td><td className="max-w-55 p-2 text-slate-700">{day.route || day.cities.join(" → ") || "—"}{day.overnightCity && <div className="text-[10px] text-slate-500">Overnight: {day.overnightCity}</div>}</td><td className="p-2">{day.meals || "—"}</td><td className="p-2 text-right"><details className="relative inline-block text-left"><summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded border bg-white hover:bg-slate-50" aria-label={`Edit day ${day.day}`}><Pencil className="h-3.5 w-3.5" /></summary><div className="absolute right-0 z-20 mt-1 grid w-[min(90vw,420px)] gap-2 rounded-lg border bg-white p-3 text-left shadow-xl">
                  <strong className="text-xs">Edit Day {day.day}</strong>
                  <Input className="h-8 text-xs" aria-label="Day title" placeholder="Day title / plan" value={day.title} onChange={(event) => editDay(index, { title: event.target.value })} />
                  <Input className="h-8 text-xs" aria-label="Day route" placeholder="Route / cities" value={day.route} onChange={(event) => editDay(index, { route: event.target.value, cities: event.target.value.split(/\s*(?:→|->|,|;)\s*/).filter(Boolean) })} />
                  <Input className="h-8 text-xs" aria-label="Overnight city" placeholder="Overnight city" value={day.overnightCity} onChange={(event) => editDay(index, { overnightCity: event.target.value })} />
                  <Input className="h-8 text-xs" aria-label="Meals" placeholder="Meals" value={day.meals} onChange={(event) => editDay(index, { meals: event.target.value })} />
                  <Textarea className="min-h-22.5 text-xs" aria-label="Detailed day description" placeholder="Full description (multiline text is retained)" value={day.description} onChange={(event) => editDay(index, { description: event.target.value })} />
                  <Textarea className="min-h-15 text-xs" aria-label="Sightseeing" placeholder="Sightseeing details" value={day.sightseeing} onChange={(event) => editDay(index, { sightseeing: event.target.value })} />
                  <Textarea className="min-h-15 text-xs" aria-label="Activities" placeholder="Activities" value={day.activities} onChange={(event) => editDay(index, { activities: event.target.value })} />
                  <Textarea className="min-h-15 text-xs" aria-label="Hotel and stay notes" placeholder="Hotel / stay notes" value={day.hotelNotes} onChange={(event) => editDay(index, { hotelNotes: event.target.value })} />
                </div></details></td></tr>)}
                  {!record.days.length && <tr><td colSpan={5} className="p-5 text-center text-xs text-slate-500">Select a canonical Programme to load its actual day routing, or link a Programme before adding itinerary content.</td></tr>}
                </tbody>
              </table>
            </div> : <div className="mt-3 grid gap-3 md:grid-cols-2">
              {(Object.keys(sectionTitles) as ManualSectionKey[]).map((key) => <ManualList key={key} section={`${sectionTitles[key]} · ${record.fieldSources?.[key] || "Manual"}`} values={record[key]} onAdd={() => addListItem(key)} onChange={(index, value) => updateList(key, index, value)} onRemove={(index) => removeListItem(key, index)} onMove={(index, direction) => { const next = [...record[key]]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; update(key, next); }} />)}
              <section className="rounded-lg border bg-white p-3"><h3 className="text-xs font-bold">Hotel Supplements · Brochure Costing / Excel</h3><p className="mt-1 text-[10px] text-slate-500">Read-only source data; no supplement or meal prices are recalculated here.</p><details className="mt-2 rounded border bg-slate-50 p-2 text-[10px]"><summary className="cursor-pointer font-semibold">View linked and workbook supplement records</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{JSON.stringify({ savedBrochureCosting: selectedQuote?.addons, selectedHotelOptions: selectedQuote?.draft_snapshot?.hotel_options, excelHotelSupplements: record.sourceHotelSupplements || [] }, null, 2)}</pre></details></section>
              {(record.sourcePricing?.length || record.sourceHotelSupplements?.length) ? <div className="rounded-md border bg-amber-50 p-3 text-xs text-amber-900 md:col-span-2"><strong>Imported source pricing kept separately</strong><p className="mt-1">{record.sourcePricing?.length || 0} Pricing rows (including any Main Info amount) and {record.sourceHotelSupplements?.length || 0} Hotel Supplements rows remain source-only. The legacy workbook dimensions are not silently mapped into Brochure Costing.</p><details className="mt-2 rounded border border-amber-200 p-2"><summary className="cursor-pointer font-semibold">View imported source values</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{JSON.stringify({ pricing: record.sourcePricing, hotelSupplements: record.sourceHotelSupplements }, null, 2)}</pre></details></div> : null}
            </div>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button variant="outline" className="h-8 text-xs" onClick={() => window.history.back()}>← Back</Button>
              <div className="flex flex-wrap gap-2"><Button variant="outline" className="h-8 text-xs" onClick={() => void exportPdf(true)}>Preview PDF</Button><Button variant="outline" className="h-8 text-xs" onClick={() => void exportPdf()}><FileDown className="mr-1 h-3.5 w-3.5" />Download PDF</Button><Button variant="outline" className="h-8 text-xs" onClick={() => void saveDraft()}><Save className="mr-2 h-3.5 w-3.5" />Save Draft</Button><Button className="h-8 text-xs" onClick={() => void saveDraft()}><Check className="mr-2 h-3.5 w-3.5" />Save Itinerary</Button></div>
            </div>
          </Card>

          <Card className="p-3 sm:p-4">
            <h2 className="mb-3 flex items-center gap-2 border-b pb-3 text-sm font-bold"><CircleHelp className="h-4 w-4" />Itinerary Preview &amp; Status</h2>
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold"><Link2 className="h-4 w-4" />Linked Programme</div><Badge className={selectedProgramme ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-200 text-slate-600"}>{selectedProgramme ? "✓ Connected" : "Not Connected"}</Badge></div>
              <p className="mt-1 pl-6 text-xs text-slate-500">{selectedProgramme ? `${selectedProgramme.name} · ${selectedProgramme.code} · ID ${selectedProgramme.id}` : "Select a canonical Programme to link this itinerary."}</p>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" />Auto-fill Coverage</div>
              <p className="mt-1 pl-6 text-xs leading-5 text-emerald-800">{autoCoverage}/4 available: Route, Duration, Start/End City, Day Plan</p>
            </div>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900"><AlertCircle className="h-4 w-4" />Manual Fields</div>
              <p className="mt-1 pl-6 text-xs leading-5 text-amber-900">{manualCoverage}/4 complete: Overview, Banner Image, Highlights, Notes</p>
            </div>
            <section className="mt-3 rounded-lg border bg-white p-3">
              <h3 className="flex items-center gap-2 text-xs font-bold"><FileSpreadsheet className="h-4 w-4" />Linked Brochure Pricing</h3>
              {record.costingQuoteId && selectedQuote && linkedPricingVersion ? <>
                <dl className="mt-2 space-y-1 text-[10px]">
                  <InfoLine label="Programme / route" value={`${selectedProgramme?.code || record.programmeCode} · ${record.routingFingerprint || "Routing identity unavailable"}`} />
                  <InfoLine label="Costing snapshot" value={`${selectedQuote.display_number || selectedQuote.quote_number} · Costing V${selectedQuote.version}`} />
                  <InfoLine label="Brochure version" value={`V${linkedPricingVersion.version} · ${linkedPricingVersion.status}`} />
                  <InfoLine label="Published version" value={publishedPricingVersion ? `V${publishedPricingVersion.version}` : "No published version"} />
                  <InfoLine label="Pax range" value={`${linkedPricingVersion.pax_min}–${linkedPricingVersion.pax_max}`} />
                  <InfoLine label="Coverage" value={linkedPricingCoverage?.readiness || "Unavailable"} />
                  <InfoLine label="Saved scenarios" value={String(linkedPricingVersion.scenarios.length)} />
                  <InfoLine label="Missing / warnings" value={String(linkedPricingVersion.validation_errors.length + (linkedPricingVersion.coverage_warnings?.length || 0))} />
                  <InfoLine label="Hotel options" value={Array.from(new Set(linkedPricingVersion.scenarios.map((scenario) => scenario.hotel_category))).join(", ") || "None"} />
                  <InfoLine label="Transport variations" value={Array.from(new Set(linkedPricingVersion.scenarios.map((scenario) => scenario.transport))).join(", ") || "None"} />
                  <InfoLine label="Occupancies" value={Array.from(new Set(linkedPricingVersion.scenarios.map((scenario) => scenario.occupancy))).join(", ") || "None"} />
                  <InfoLine label="Validity" value={`${linkedPricingVersion.validity_from || "—"} → ${linkedPricingVersion.validity_till || "—"}`} />
                </dl>
                <details className="mt-2 rounded border bg-slate-50 p-2 text-[10px]"><summary className="cursor-pointer font-semibold">Read saved commercial snapshot (no recalculation)</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{JSON.stringify({ sourceQuoteId: selectedQuote.id, costingVersion: selectedQuote.version, rateSheetRows: selectedQuote.rate_sheet_rows || [], totals: selectedQuote.totals, inclusions: selectedQuote.inclusions, savedScenarios: selectedQuote.scenarios || [], hotelAndServiceSelections: { hotelOptions: selectedQuote.draft_snapshot?.hotel_options, transport: selectedQuote.draft_snapshot?.transport, meals: selectedQuote.draft_snapshot?.meal_selections, landServices: { guides: selectedQuote.draft_snapshot?.guides, entrances: selectedQuote.draft_snapshot?.entrances, activities: selectedQuote.draft_snapshot?.activities, miscellaneous: selectedQuote.draft_snapshot?.misc } } }, null, 2)}</pre></details>
                <div className="mt-3 border-t pt-2">
                  <p className="text-[10px] font-semibold">Exact published-price preview</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <Input className="h-7 text-[10px]" type="number" min="1" placeholder="Pax" aria-label="Price lookup Pax" value={pricePax} onChange={(event) => setPricePax(event.target.value)} />
                    <select className="h-7 rounded border bg-white px-1 text-[10px]" aria-label="Price lookup hotel option" value={priceHotel} onChange={(event) => setPriceHotel(event.target.value)}><option value="">Hotel option</option>{Array.from(new Set(linkedScenarios.map((scenario) => scenario.hotel_category))).map((hotel) => <option key={hotel} value={hotel}>{hotel}</option>)}</select>
                    <select className="h-7 rounded border bg-white px-1 text-[10px]" aria-label="Price lookup transport variation" value={priceTransport} onChange={(event) => setPriceTransport(event.target.value)}><option value="">Transport</option>{Array.from(new Map(linkedScenarios.map((scenario) => [scenario.transport_variation_id || scenario.transport, scenario])).entries()).map(([key, scenario]) => <option key={key} value={key}>{scenario.transport}</option>)}</select>
                    <select className="h-7 rounded border bg-white px-1 text-[10px]" aria-label="Price lookup occupancy" value={priceOccupancy} onChange={(event) => setPriceOccupancy(event.target.value as RoomSharing | "")}><option value="">Occupancy</option>{Array.from(new Set(linkedScenarios.map((scenario) => scenario.occupancy))).map((occupancy) => <option key={occupancy} value={occupancy}>{occupancy}</option>)}</select>
                    <Input className="col-span-2 h-7 text-[10px]" type="date" aria-label="Price lookup departure date" value={priceDate} onChange={(event) => setPriceDate(event.target.value)} />
                  </div>
                  <p className={`mt-2 rounded p-2 text-[10px] font-semibold ${priceResult.available ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                    {priceResult.available ? `Exact published match: ₹${priceResult.price_per_person.toLocaleString("en-IN")} per person · ${priceResult.brochure_version_id} · V${priceResult.version}` : "Price not available for this combination."}
                  </p>
                </div>
              </> : <p className="mt-2 text-[10px] text-slate-500">{record.costingQuoteId ? "The linked costing snapshot/version is no longer available." : "Pricing is not linked. You can save the itinerary draft and link a matching costing when one becomes available."}</p>}
            </section>
            <section className="mt-3 rounded-lg border bg-white p-3">
              <h3 className="text-xs font-bold">Portal pricing approval</h3>
              <p className="mt-1 text-[10px] text-slate-500">Brochure finalization and independent Portal approval are separate controls.</p>
              {record.portalSnapshot ? <dl className="mt-2 space-y-1 text-[10px]"><InfoLine label="Server snapshot" value={record.portalSnapshot.id} /><InfoLine label="Brochure version" value={`V${record.portalSnapshot.version}`} /><InfoLine label="Portal approval" value={record.portalSnapshot.status} /><InfoLine label="Submitted" value={record.portalSnapshot.submittedAt || "Server timestamp unavailable"} /></dl> : <p className="mt-2 text-[10px] text-amber-700">No server-confirmed snapshot has been submitted.</p>}
              <Button variant="outline" className="mt-3 h-8 w-full text-xs" disabled={submittingSnapshot || !linkedPricingVersion || record.portalSnapshot?.status === "Approved"} onClick={() => void submitSnapshot()}>{submittingSnapshot ? "Submitting…" : record.portalSnapshot ? "Refresh / submit exact snapshot" : "Submit Brochure Pricing for Approval"}</Button>
              {authLifecycle.employee?.role === "Super Admin" && record.portalSnapshot?.status === "Pending" && <div className="mt-3 space-y-2 border-t pt-3"><p className="text-[10px] font-semibold">Independent Super Admin review</p><Input className="h-8 text-xs" placeholder="Verification method *" value={verificationMethod} onChange={(event) => setVerificationMethod(event.target.value)} /><Input className="h-8 text-xs" placeholder="Attestation reference *" value={attestationReference} onChange={(event) => setAttestationReference(event.target.value)} /><Textarea className="min-h-16 text-xs" placeholder="Reviewer remarks" value={reviewerRemarks} onChange={(event) => setReviewerRemarks(event.target.value)} /><Button className="h-8 w-full text-xs" disabled={!verificationMethod.trim() || !attestationReference.trim()} onClick={() => void approveSnapshot()}>Approve server snapshot</Button><p className="text-[10px] text-slate-500">The server rejects self-approval and revalidates the immutable price matrix.</p></div>}
              {record.portalPublication && <p className="mt-2 text-[10px] text-emerald-700">Portal package {record.portalPublication.packageId} · revision {record.portalPublication.revision} · {record.portalPublication.url}</p>}
            </section>
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-9 text-xs" onClick={() => void saveDraft()}>Save Draft</Button><Button className="h-9 text-xs" disabled={publishingPortal || record.portalSnapshot?.status !== "Approved"} title={record.portalSnapshot?.status === "Approved" ? undefined : "A separate Super Admin must approve the server snapshot first."} onClick={() => void pushToPortal()}><CloudUpload className="mr-1.5 h-3.5 w-3.5" />{publishingPortal ? "Publishing…" : "Push to Portal"}</Button></div>
              <p className="text-center text-[10px] text-slate-500">Publishing is confirmed only after protected backend readback.</p>
              {validation.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900"><strong>Publish validation</strong><ul className="mt-1 list-disc pl-4">{validation.map((error) => <li key={error}>{error}</li>)}</ul></div>}
              <button type="button" onClick={() => setPortalPreview((value) => !value)} className="w-full text-[10px] text-primary underline">{portalPreview ? "Hide" : "Preview"} publishable package payload</button>
              {portalPreview && <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[9px] text-slate-100">{JSON.stringify(buildPayload(record), null, 2)}</pre>}
            </div>
          </Card>
        </div>
      </div>

      {importPreview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportPreview(null); }}><div role="dialog" aria-modal="true" aria-labelledby="import-preview-title" className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 id="import-preview-title" className="text-lg font-bold">Workbook Import Preview</h2><p className="text-xs text-slate-500">{importPreview.fileName} · Review mappings before creating a new draft.</p></div><button onClick={() => setImportPreview(null)} aria-label="Close import preview"><X className="h-5 w-5" /></button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3 text-xs"><strong>Package information</strong><dl className="mt-2 space-y-1"><InfoLine label="Title" value={importPreview.data.title || "Not mapped"} /><InfoLine label="Code" value={importPreview.data.code || "Not mapped"} /><InfoLine label="Duration" value={`${importPreview.data.nights ?? "—"} Nights / ${importPreview.data.daysCount ?? "—"} Days`} /><InfoLine label="Day rows" value={String(importPreview.data.days?.length || 0)} /></dl></div><div className="rounded-lg border p-3 text-xs"><strong>Mapped content</strong><p className="mt-2">Highlights {importPreview.data.highlights?.length || 0} · Included {importPreview.data.inclusions?.length || 0} · Excluded {importPreview.data.exclusions?.length || 0} · Facts {importPreview.data.facts?.length || 0} · Notes {importPreview.data.notes?.length || 0}</p><p className="mt-2">Pricing {importPreview.sourcePricing.length} rows · Hotel supplements {importPreview.sourceHotelSupplements.length} rows (source-only)</p></div></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{importPreview.sheets.map((sheet) => <div key={sheet.source} className="flex items-center justify-between rounded border px-3 py-2 text-xs"><span><strong>{sheet.source}</strong><span className="ml-2 text-slate-500">{sheet.mapping}</span></span><Badge variant={sheet.status === "mapped" ? "secondary" : "destructive"}>{sheet.status}</Badge></div>)}</div>
        {Boolean(importPreview.data.days?.length) && <div className="mt-3 rounded-lg border p-3"><h3 className="text-xs font-bold">Day-plan preview</h3><div className="mt-2 max-h-40 space-y-2 overflow-auto">{importPreview.data.days?.slice(0, 5).map((day) => <div key={day.day} className="border-l-2 border-primary/40 pl-2 text-xs"><strong>Day {day.day}: {day.title || "Untitled day"}</strong><p className="line-clamp-3 whitespace-pre-wrap text-slate-600">{day.description || "No description mapped"}</p></div>)}</div></div>}
        {importTarget && !importAction && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>Matching itinerary found: {importTarget.title || importTarget.code}</strong><p className="mt-1">{importTarget.status === "Published" ? "Published records are protected; create a new editable copy." : "The existing banner, Programme link, costing link, and non-empty manual content stay intact unless you select a field to replace."}</p><div className="mt-3 flex flex-wrap gap-2">{importTarget.status !== "Published" && <Button type="button" onClick={() => setImportAction("update")}>Update Existing Itinerary Draft</Button>}<Button type="button" variant="outline" onClick={() => setImportAction("copy")}>Create a Separate Copy</Button><Button type="button" variant="ghost" onClick={() => { setImportPreview(null); setImportTarget(null); }}>Cancel</Button></div></div>}
        {importAction === "copy" && <div className="mt-3 rounded-lg border p-3 text-xs"><label className={labelClass}>New unique package code *</label><Input className={inputClass} value={copyCode} onChange={(event) => setCopyCode(event.target.value)} placeholder="Enter a unique package code" /><p className="mt-1 text-slate-500">The original itinerary and its canonical Programme identity will not be changed.</p></div>}
        {importAction === "update" && importTarget && <div className="mt-3 rounded-lg border p-3 text-xs"><strong>Field-level merge</strong><p className="mt-1 text-slate-500">Empty fields will be populated. Select only the content you explicitly want to replace; pricing and hotel supplements remain source-only references.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{importContentFields.map((field) => <label key={field} className="flex items-center gap-2 rounded border px-2 py-1.5"><input type="checkbox" checked={replaceImportFields.includes(field)} onChange={(event) => setReplaceImportFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} />Replace {importContentLabels[field]}</label>)}</div></div>}
        {importPreview.warnings.length > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Review warnings</strong><ul className="mt-1 list-disc pl-5">{importPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => { setImportPreview(null); setImportTarget(null); setImportAction(null); }}>Cancel</Button>{(!importTarget || importAction) && <Button onClick={() => void confirmImport()}><FileSpreadsheet className="mr-2 h-4 w-4" />{importAction === "update" ? "Update Draft" : importAction === "copy" ? "Create Copy as Draft" : "Confirm Import as Draft"}</Button>}</div>
      </div></div>}
    </div>
  );
}

function SummaryCard({ icon, label, value, small = false }: { icon: React.ReactNode; label: string; value: string; small?: boolean }) {
  return <Card className="flex min-w-0 items-center gap-3 p-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">{icon}</div><div className="min-w-0"><div className="text-[10px] font-medium text-slate-500">{label}</div><div className={`${small ? "truncate text-xs" : "text-lg"} font-bold text-slate-900`}>{value}</div></div></Card>;
}
function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><label className={labelClass}>{label}</label>{children}</div>;
}
function ManualList({ section, values, onAdd, onChange, onRemove, onMove }: { section: string; values: string[]; onAdd: () => void; onChange: (index: number, value: string) => void; onRemove: (index: number) => void; onMove: (index: number, direction: number) => void }) {
  return <section className="rounded-lg border bg-white p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold">{section}</h3><Button type="button" variant="outline" className="h-7 px-2 text-[10px]" onClick={onAdd}><Plus className="mr-1 h-3 w-3" />Add item</Button></div><div className="space-y-2">{values.map((value, index) => <div key={`${section}-${index}`} className="flex items-start gap-1"><Textarea className="min-h-13.5 text-xs" aria-label={`${section} item ${index + 1}`} value={value} onChange={(event) => onChange(index, event.target.value)} placeholder={`${section} item`} /><div className="flex flex-col"><Button type="button" variant="ghost" className="h-6 w-7 p-0" aria-label={`Move ${section} item up`} disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp className="h-3 w-3" /></Button><Button type="button" variant="ghost" className="h-6 w-7 p-0" aria-label={`Move ${section} item down`} disabled={index === values.length - 1} onClick={() => onMove(index, 1)}><ArrowDown className="h-3 w-3" /></Button><Button type="button" variant="ghost" className="h-6 w-7 p-0 text-red-600" aria-label={`Remove ${section} item ${index + 1}`} onClick={() => onRemove(index)}><Trash2 className="h-3 w-3" /></Button></div></div>)}{!values.length && <p className="text-[10px] text-slate-500">No items added.</p>}</div></section>;
}
function CalendarIcon() { return <FileSpreadsheet className="h-3.5 w-3.5" />; }
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-2"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value}</dd></div>; }
function buildPayload(record: ItineraryRecord) {
  return toPortalPackagePayload(record);
}

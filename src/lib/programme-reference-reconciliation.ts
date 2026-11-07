import * as XLSX from "xlsx";
import type { SavedProgram } from "@/lib/wizard/agents-store";

export interface ProgrammeReferenceRow {
  internalCode: string;
  portalCode: string;
  duration: string;
  name: string;
  route: string;
}

export interface ProgrammeReconciliationReport {
  sourceRows: number;
  uniqueSourceCodes: number;
  populatedNames: number;
  populatedDurations: number;
  populatedRoutes: number;
  populatedPortalCodes: number;
  matched: number;
  missingFromMaster: ProgrammeReferenceRow[];
  masterOnly: SavedProgram[];
  missingNames: ProgrammeReferenceRow[];
  nameConflicts: Array<{ source: ProgrammeReferenceRow; master: SavedProgram }>;
  durationConflicts: Array<{ source: ProgrammeReferenceRow; master: SavedProgram }>;
  routeConflicts: Array<{ source: ProgrammeReferenceRow; master: SavedProgram; unrecognisedStops: string[] }>;
  duplicateSourceCodes: string[];
  missingSourceCodes: number;
}

const normalizeHeader = (value: unknown) => String(value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normalizeCode = (value: string) => value.trim().replace(/\s+/g, "").toLocaleUpperCase();
const normalizeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function durationPair(value: string): [number, number] | undefined {
  const nights = Number(value.match(/(\d+)\s*(?:night|nights|n)\b/i)?.[1]);
  const days = Number(value.match(/(\d+)\s*(?:day|days|d)\b/i)?.[1]);
  return Number.isFinite(nights) && Number.isFinite(days) ? [nights, days] : undefined;
}

export function parseProgrammeReferenceWorkbook(buffer: ArrayBuffer): ProgrammeReferenceRow[] {
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false, blankrows: false });
    if (!rows.length) continue;
    const keys = Object.keys(rows[0]);
    const headerByRole = new Map(keys.map((key) => [normalizeHeader(key), key]));
    const findKey = (...names: string[]) => names.map(normalizeHeader).map((name) => headerByRole.get(name)).find(Boolean);
    const codeKey = findKey("Tour Code - Internal", "Internal Programme Code", "Programme Code", "Tour Code");
    const nameKey = findKey("Program Name", "Programme Name", "Name");
    const routeKey = findKey("Program Route", "Programme Route", "Route");
    const durationKey = findKey("Duration", "Nights / Days");
    if (!codeKey || !nameKey || !routeKey || !durationKey) continue;
    const portalKey = findKey("Tour Code - Portal", "Portal Tour Code");
    return rows.map((row) => ({
      internalCode: String(row[codeKey] ?? "").trim(),
      portalCode: portalKey ? String(row[portalKey] ?? "").trim() : "",
      duration: String(row[durationKey] ?? "").trim(),
      name: String(row[nameKey] ?? "").trim(),
      route: String(row[routeKey] ?? "").trim(),
    })).filter((row) => Boolean(row.internalCode || row.portalCode || row.duration || row.name || row.route));
  }
  throw new Error("Could not find a worksheet with internal code, name, duration, and route columns.");
}

export function reconcileProgrammeReference(
  programmes: SavedProgram[],
  referenceRows: ProgrammeReferenceRow[],
): ProgrammeReconciliationReport {
  const byCode = new Map(programmes.map((program) => [normalizeCode(program.code || program.id), program]));
  const seen = new Set<string>();
  const duplicateSourceCodes = new Set<string>();
  const missingFromMaster: ProgrammeReferenceRow[] = [];
  const missingNames: ProgrammeReferenceRow[] = [];
  const nameConflicts: ProgrammeReconciliationReport["nameConflicts"] = [];
  const durationConflicts: ProgrammeReconciliationReport["durationConflicts"] = [];
  const routeConflicts: ProgrammeReconciliationReport["routeConflicts"] = [];
  let matched = 0;
  let missingSourceCodes = 0;
  let populatedNames = 0;
  let populatedDurations = 0;
  let populatedRoutes = 0;
  let populatedPortalCodes = 0;
  const allMasterCities = new Set(programmes.flatMap((program) => [
    ...(program.cities || []),
    ...program.routing.flatMap((row) => [row.from_city, row.destination_city, row.overnight_city].filter((value): value is string => Boolean(value))),
  ]).map(normalizeName));

  for (const source of referenceRows) {
    if (source.name) populatedNames += 1;
    if (source.duration) populatedDurations += 1;
    if (source.route) populatedRoutes += 1;
    if (source.portalCode) populatedPortalCodes += 1;
    const code = normalizeCode(source.internalCode);
    if (!code) {
      missingSourceCodes += 1;
      continue;
    }
    if (seen.has(code)) duplicateSourceCodes.add(code);
    seen.add(code);
    const master = byCode.get(code);
    if (!master) {
      missingFromMaster.push(source);
      continue;
    }
    matched += 1;
    if (!source.name) missingNames.push(source);
    else if (normalizeName(source.name) !== normalizeName(master.name) && !master.name_missing)
      nameConflicts.push({ source, master });
    const pair = durationPair(source.duration);
    if (pair && (master.nights !== pair[0] || master.days !== pair[1]))
      durationConflicts.push({ source, master });

    const canonicalCities = new Set([...(master.cities || []), ...master.routing.flatMap((row) => [row.from_city, row.destination_city, row.overnight_city].filter((value): value is string => Boolean(value)))].map(normalizeName));
    const aliases: Record<string, string> = {
      idr: "indore", ujj: "ujjain", omk: "omkareshwar", mah: "maheshwar", man: "mandu",
      bhp: "bhopal", bho: "bhopal", san: "sanchi", bhim: "bhimbetka", bhoj: "bhojpur",
      jbp: "jabalpur", jab: "jabalpur", jlr: "jabalpur", hjr: "khajuraho", orc: "orchha",
      gwl: "gwalior", dat: "datia", mor: "morena", pch: "pachmarhi", pach: "pachmarhi",
      kan: "kanha", ban: "bandhavgarh", pen: "pench", pan: "panna", mad: "madai",
      amk: "amarkantak", ckt: "chitrakoot", shp: "shivpuri", bur: "burhanpur", seh: "sehore",
      ppi: "pipariya", dhol: "dholpur",
      "tawa reservoir": "tawa",
      "satpura national park": "satpura",
      "satpura national park tiger reserve": "satpura",
    };
    const routeNames = new Set([...allMasterCities, ...canonicalCities, ...Object.keys(aliases)]);
    const routeMatches = [...routeNames].flatMap((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return [...source.route.matchAll(new RegExp(`\\b${escaped}\\b`, "gi"))].map((match) => ({
        canonical: aliases[name] || name,
        index: match.index ?? 0,
      }));
    }).sort((left, right) => left.index - right.index);
    const routeStops = routeMatches
      .filter((entry, index, matches) => index === 0 || entry.canonical !== matches[index - 1].canonical)
      .map((entry) => entry.canonical);
    let unparsedRoute = source.route;
    for (const name of [...routeNames].sort((left, right) => right.length - left.length)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      unparsedRoute = unparsedRoute.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
    }
    unparsedRoute = unparsedRoute
      .replace(/\b\d+\s*n\b/gi, " ")
      .replace(/\b(?:ex|n|night|nights|day|days|national|park|tiger|reserve|reservoir|stay|route)\b/gi, " ")
      .replace(/\d+/g, " ");
    const unparsedTokens = unparsedRoute.match(/[A-Za-z]{3,}/g) || [];
    const unrecognisedStops = [...new Set([
      ...routeStops.filter((stop) => !canonicalCities.has(stop)),
      ...unparsedTokens.map(normalizeName),
    ])];
    if (unrecognisedStops.length) routeConflicts.push({ source, master, unrecognisedStops });
  }

  const referenceCodes = new Set(referenceRows.map((row) => normalizeCode(row.internalCode)).filter(Boolean));
  return {
    sourceRows: referenceRows.length,
    uniqueSourceCodes: seen.size,
    populatedNames,
    populatedDurations,
    populatedRoutes,
    populatedPortalCodes,
    matched,
    missingFromMaster,
    masterOnly: programmes.filter((program) => !referenceCodes.has(normalizeCode(program.code || program.id))),
    missingNames,
    nameConflicts,
    durationConflicts,
    routeConflicts,
    duplicateSourceCodes: [...duplicateSourceCodes].sort(),
    missingSourceCodes,
  };
}

import fs from "node:fs/promises";
import { createServer } from "vite";

const input = process.argv[2] || "C:/Users/Acer/Downloads/Tour Programs Data Sheet (1).xlsx";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const [{ getPrograms }, { parseProgrammeReferenceWorkbook, reconcileProgrammeReference }] = await Promise.all([
    vite.ssrLoadModule("/src/lib/wizard/agents-store.ts"),
    vite.ssrLoadModule("/src/lib/programme-reference-reconciliation.ts"),
  ]);
  const workbook = await fs.readFile(input);
  const referenceRows = parseProgrammeReferenceWorkbook(workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength));
  const programmes = getPrograms();
  const report = reconcileProgrammeReference(programmes, referenceRows);
  console.log(JSON.stringify({
    referenceWorkbook: input,
    canonicalProgrammes: programmes.length,
    workbookRows: report.sourceRows,
    uniqueSourceCodes: report.uniqueSourceCodes,
    matchedCodes: report.matched,
    populatedNames: report.populatedNames,
    populatedDurations: report.populatedDurations,
    populatedRoutes: report.populatedRoutes,
    populatedPortalCodes: report.populatedPortalCodes,
    missingFromMaster: report.missingFromMaster.slice(0, 25).map((row) => row.internalCode),
    masterOnlyCodes: report.masterOnly.slice(0, 25).map((row) => row.code),
    missingNames: report.missingNames.map((row) => row.internalCode),
    nameConflictCount: report.nameConflicts.length,
    nameConflicts: report.nameConflicts.slice(0, 25).map(({ source, master }) => ({ code: source.internalCode, workbookName: source.name, masterName: master.name })),
    durationConflictCount: report.durationConflicts.length,
    durationConflicts: report.durationConflicts.slice(0, 25).map(({ source, master }) => ({ code: source.internalCode, workbookDuration: source.duration, masterDuration: master.duration_label })),
    routeConflictCount: report.routeConflicts.length,
    routeConflicts: report.routeConflicts.slice(0, 25).map(({ source, unrecognisedStops }) => ({ code: source.internalCode, unrecognisedStops })),
    duplicateSourceCodes: report.duplicateSourceCodes,
    missingSourceCodes: report.missingSourceCodes,
  }, null, 2));
} finally {
  await vite.close();
}

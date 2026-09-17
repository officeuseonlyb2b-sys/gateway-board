import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { format, resolveConfig } from "prettier";
import XLSX from "xlsx";

const ROOT = process.cwd();
const SOURCE_NAME = "Query Tracker Sheet FY 26-27.xlsx";
const SOURCE = path.join(ROOT, "data-import", SOURCE_NAME);
const OUTPUT = path.join(ROOT, "src", "lib", "crm", "query-tracker-import.generated.ts");
const DATASET_ID = "query-tracker-fy26-27-2026-09-16-v1";
const MARKER_ID = `crm_dataset_${DATASET_ID}`;

const clean = (value) =>
  value == null
    ? ""
    : String(value)
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const finiteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const INDIA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateOnly = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    INDIA_DATE.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Workbook dates are day-level values. 09:00 IST keeps them on the same
// business date in both India and UTC without inventing a spreadsheet time.
const businessIso = (value) => {
  const date = dateOnly(value);
  return date ? `${date}T03:30:00.000Z` : "";
};

const addDays = (iso, days) => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const safeId = (value) => clean(value).replace(/[^a-zA-Z0-9_-]+/g, "_");

const normalizeStage = (value) => {
  const status = clean(value).toUpperCase();
  if (status === "WIN") return "Won";
  if (status === "LOST") return "Lost";
  if (status === "NURTURING") return "Nurturing";
  throw new Error(`Unsupported Final Lead Status: ${value}`);
};

const costingType = (queryType) => {
  const value = clean(queryType).toUpperCase();
  if (value.includes("FIT") && value.includes("GIT")) return "FIT / GIT";
  if (value.includes("GIT")) return "GIT";
  if (value.includes("FIT")) return "FIT";
  return "Not specified";
};

if (!fs.existsSync(SOURCE)) throw new Error(`Workbook not found: ${SOURCE}`);

const workbook = XLSX.readFile(SOURCE, { cellDates: true, raw: true });
const sheet = workbook.Sheets["QTS - EMP"];
if (!sheet) throw new Error('Worksheet "QTS - EMP" was not found.');

// Zero-based range 3 makes worksheet row 4 the object header row.
const sourceRows = XLSX.utils.sheet_to_json(sheet, { range: 3, defval: null, raw: true });
const rows = sourceRows.filter((row) => clean(row["Query No."]) && dateOnly(row["Query Date"]));

const queries = [];
const tasks = [];
const events = [];

for (const row of rows) {
  const queryId = clean(row["Query No."]);
  const id = `excel_${safeId(queryId)}`;
  const createdAt = businessIso(row["Query Date"]);
  const stage = normalizeStage(row["Final Lead Status"]);
  const owner = clean(row["Travel Advisor"]);
  const marketSource = clean(row["Query Market Source"]);
  const sourceType = clean(row["Query Source Type"]);
  const customer = clean(row["Query Source Name"]) || clean(row["Contact Person"]) || "Direct";
  const pax = Math.max(0, finiteNumber(row["No. of Pax"]));
  const perPerson = Math.max(0, finiteNumber(row["Per Person Package Cost"]));
  const workbookTotal = Math.max(0, finiteNumber(row["Total Query Amount"]));
  // Recalculate three stale formula caches where pax and per-person values exist.
  const total = workbookTotal || (pax && perPerson ? pax * perPerson : 0);
  const queryType = clean(row["Query Type"]);
  const queryFor = clean(row["Query For"]);
  const hotelCategory = clean(row["Hotel Category"]);
  const followupDates = ["1st Fu", "2nd Fu", "3rd Fu", "4th Fu", "5th Fu", "6th Fu"]
    .map((column) => businessIso(row[column]))
    .filter(Boolean);
  const firstFollowup = followupDates[0] || "";
  const lastFollowup = followupDates.at(-1) || "";
  const isClosed = stage === "Won" || stage === "Lost";
  const closedAt = isClosed ? lastFollowup || createdAt : undefined;
  const followupDue = stage === "Nurturing" ? lastFollowup || addDays(createdAt, 3) : "";
  const outcomeReason = clean(row["Remarks / Reason"]);

  const lifecycle = [
    { label: "New", at: createdAt },
    { label: "Assigned", at: createdAt },
    { label: "Requirement Review" },
    { label: "Costing" },
    { label: "Quotation Sent" },
    { label: "Follow-up", ...(firstFollowup ? { at: firstFollowup } : {}) },
    { label: "Won / Lost", ...(closedAt ? { at: closedAt } : {}) },
  ];

  const activities = [
    ...followupDates.map((at, index) => ({
      id: `excel_fu_${safeId(queryId)}_${index + 1}`,
      title: `Follow-up ${index + 1} recorded in offline tracker`,
      at,
      by: owner || "Excel Import",
      meta: clean(row["Conversation Medium"]) || undefined,
    })),
    {
      id: `excel_created_${safeId(queryId)}`,
      title: "Query received in offline tracker",
      at: createdAt,
      by: owner || "Excel Import",
      meta: sourceType || marketSource || undefined,
    },
  ].sort((a, b) => b.at.localeCompare(a.at));

  const query = {
    id,
    query_id: queryId,
    lead_id: `LD-IMPORT-${String(queries.length + 1).padStart(4, "0")}`,
    created_at: createdAt,
    assigned_on: createdAt,
    created_by: "Excel Import",
    assignment_status: "Assigned",
    assigned_at: createdAt,
    first_action_at: firstFollowup || createdAt,
    stage_changed_at: closedAt || lastFollowup || createdAt,
    first_followup_at: firstFollowup || undefined,
    last_followup_at: lastFollowup || undefined,
    nurturing_at: stage === "Nurturing" ? firstFollowup || createdAt : undefined,
    assignment_history: [
      {
        assigned_at: createdAt,
        assigned_by: "Excel Import",
        assigned_to: owner,
        reason: "Imported owner from offline Query Tracker",
      },
    ],
    work_status: stage === "Won" ? "Won" : stage === "Lost" ? "Lost" : "Open",
    primary_unit: "Madhya Pradesh",
    participating_units: ["Madhya Pradesh"],

    lead_source: sourceType || marketSource,
    customer,
    contact_person: clean(row["Contact Person"]),
    mobile: clean(row["Contact Number"]),
    email: clean(row["Email Id"]),
    market: clean(row["Query Market / Region"]),
    priority: "Normal",
    requirement: queryFor,
    customer_type: marketSource === "B2B" ? "B2B Agent" : "B2C Client",
    relationship_owner: owner,

    enquiry_type: queryType,
    travel_type: costingType(queryType),
    destination: "Madhya Pradesh",
    travel_start: dateOnly(row["Tour Starting Date"]),
    travel_end: dateOnly(row["Tour Ending Date"]),
    pax,
    adults: pax,
    children: 0,
    min_pax: pax,
    max_pax: pax,
    costing_basis: costingType(queryType),
    hotel_category_from: hotelCategory,
    hotel_category_to: hotelCategory,
    program_id: clean(row["Interested Program Code"]) || undefined,
    program_name: clean(row["Interested Program Name"]) || undefined,
    routing: clean(row["Interested Program Routing"]) || undefined,
    special_requirements: clean(row["Travel Period Marked As"]) || undefined,

    stage,
    owner,
    value: total,
    next_action:
      stage === "Nurturing"
        ? "Follow up with client"
        : stage === "Won"
          ? "Won — Operations handoff"
          : "Closed — Lost",
    followup_due: followupDue,
    lifecycle,
    activities,
    commercials: {
      cost_price: 0,
      selling_price: total,
      commission_pct: 0,
      bottom_line: total,
      top_line: total,
      final_selling: total,
    },
    assigned_by: "Excel Import",
    last_updated_by: owner || "Excel Import",
    last_activity_at: lastFollowup || createdAt,
    followup_note: stage === "Nurturing" ? "Imported next action from offline tracker" : undefined,
    lost_reason: stage === "Lost" ? outcomeReason || "Not captured in source workbook" : undefined,
    closed_at: closedAt,
    operations_handoff:
      stage === "Won"
        ? {
            id: `ops_${safeId(queryId)}`,
            status: "Awaiting Operations Acceptance",
            created_at: closedAt || createdAt,
            created_by: owner || "Excel Import",
            note: "Imported Won query — minimal Operations handoff pending",
          }
        : undefined,

    source_serial: finiteNumber(row["S. No"]),
    source_workbook: SOURCE_NAME,
    query_market_source: marketSource,
    query_base_city: clean(row["Query Base City"]),
    query_source_type: sourceType,
    conversation_medium: clean(row["Conversation Medium"]),
    tour_start_city: clean(row["Tour Starting City"]),
    tour_end_city: clean(row["Tour Ending City"]),
    travel_period: clean(row["Travel Period Marked As"]),
    program_type: clean(row["Program Type"]),
    program_region: clean(row["Program Region"]),
    per_person_package_cost: perPerson,
    source_followup_dates: followupDates,
    source_status_flags: {
      new_status: clean(row.New),
      working: clean(row.Working),
      nurturing: clean(row.Nurturing),
    },
  };

  queries.push(query);

  if (stage === "Nurturing") {
    tasks.push({
      id: `excel_task_${safeId(queryId)}`,
      title: `Follow up with ${customer} (${queryId})`,
      query_id: queryId,
      due_at: followupDue,
      note: `Imported from offline tracker; ${followupDates.length} follow-up date(s) recorded.`,
      owner,
      done: false,
      assigned_by: "Excel Import",
      assigned_at: createdAt,
      priority: "Normal",
      category: "Follow-up",
      updates: [],
    });
  }

  events.push({
    id: `excel_event_${safeId(queryId)}`,
    type: "note_added",
    at: lastFollowup || createdAt,
    by: owner || "Excel Import",
    title: "Query imported from offline tracker",
    detail: `${stage} • ${followupDates.length} follow-up date(s) • ${SOURCE_NAME}`,
    query_id: queryId,
    lead_id: query.lead_id,
  });
}

const duplicateIds = queries.filter(
  (query, index) => queries.findIndex((item) => item.query_id === query.query_id) !== index,
);
if (duplicateIds.length)
  throw new Error(`Duplicate Query IDs: ${duplicateIds.map((q) => q.query_id).join(", ")}`);

const counts = queries.reduce((acc, query) => {
  acc[query.stage] = (acc[query.stage] || 0) + 1;
  return acc;
}, {});
const totalValue = queries.reduce((sum, query) => sum + query.value, 0);

const markerEvent = {
  id: MARKER_ID,
  type: "note_added",
  at: "2026-09-17T03:30:00.000Z",
  by: "System Import",
  title: "Authoritative Query Tracker dataset installed",
  detail: `${SOURCE_NAME} • ${queries.length} populated queries`,
};

const banner = `// AUTO-GENERATED by scripts/generate-query-tracker-data.mjs.\n// Source: data-import/${SOURCE_NAME}\n// Do not hand-edit; regenerate with npm run data:import:queries.\n`;
const moduleText = `${banner}\nimport type { CrmEvent, CrmQuery, CrmTask } from "./types";\n\nexport const QUERY_TRACKER_DATASET_ID = ${JSON.stringify(DATASET_ID)};\nexport const QUERY_TRACKER_MARKER_ID = ${JSON.stringify(MARKER_ID)};\nexport const IMPORTED_QUERY_MANIFEST = ${JSON.stringify({ source: SOURCE_NAME, sheet: "QTS - EMP", populatedRows: queries.length, statusCounts: counts, totalValue }, null, 2)} as const;\n\nexport const IMPORTED_QUERIES: CrmQuery[] = ${JSON.stringify(queries, null, 2)};\n\nexport const IMPORTED_QUERY_TASKS: CrmTask[] = ${JSON.stringify(tasks, null, 2)};\n\nexport const IMPORTED_QUERY_EVENTS: CrmEvent[] = ${JSON.stringify(events, null, 2)};\n\nexport const IMPORTED_DATASET_MARKER: CrmEvent = ${JSON.stringify(markerEvent, null, 2)};\n`;

const prettierOptions = (await resolveConfig(OUTPUT)) || {};
fs.writeFileSync(
  OUTPUT,
  await format(moduleText, { ...prettierOptions, parser: "typescript" }),
  "utf8",
);
console.log(`Generated ${path.relative(ROOT, OUTPUT)}`);
console.log(`Queries: ${queries.length}; tasks: ${tasks.length}; events: ${events.length}`);
console.log(`Stages: ${JSON.stringify(counts)}; value: ${totalValue.toFixed(2)}`);

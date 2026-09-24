import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { format, resolveConfig } from "prettier";
import XLSX from "xlsx";

const ROOT = process.cwd();
const SOURCE_NAME = "Query Tracker Sheet FY 26-27.xlsx";
const SOURCE = path.join(ROOT, "data-import", SOURCE_NAME);
const OUTPUT = path.join(ROOT, "src", "lib", "crm", "query-tracker-import.generated.ts");
const RELATIONSHIP_OUTPUT = path.join(
  ROOT,
  "src",
  "lib",
  "crm",
  "relationship-master-import.generated.ts",
);
const DATASET_ID = "query-tracker-fy26-27-2026-09-18-v3";
const RELATIONSHIP_DATASET_ID = "relationship-master-fy26-27-2026-09-18-v2";
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
const normalizeIdentity = (value) => clean(value).toLowerCase();
const phoneDigits = (value) => clean(value).replace(/\D/g, "");
const stableHash = (value) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
const isMeaningfulName = (value) => {
  const normalized = normalizeIdentity(value);
  return Boolean(normalized && !["-", "na", "n/a", "direct", "unknown"].includes(normalized));
};
const lastFilled = (group, column) => {
  for (let index = group.length - 1; index >= 0; index -= 1) {
    const value = clean(group[index][column]);
    if (value) return value;
  }
  return "";
};
const uniqueFilled = (group, column) => [
  ...new Set(group.map((row) => clean(row[column])).filter(Boolean)),
];

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

const b2bKey = (row) => {
  const agency = clean(row["Query Source Name"]);
  const contact = clean(row["Contact Person"]);
  const email = clean(row["Email Id"]);
  const phone = phoneDigits(row["Contact Number"]);
  const city = clean(row["Query Base City"]);
  if (isMeaningfulName(agency)) return `agency:${normalizeIdentity(agency)}`;
  if (isMeaningfulName(email)) return `email:${normalizeIdentity(email)}`;
  if (phone) return `phone:${phone}`;
  if (isMeaningfulName(contact))
    return `contact:${normalizeIdentity(contact)}|${normalizeIdentity(city)}`;
  return `query:${clean(row["Query No."])}`;
};

const b2cKey = (row) => {
  const contact = clean(row["Contact Person"]);
  const email = clean(row["Email Id"]);
  const phone = phoneDigits(row["Contact Number"]);
  const city = clean(row["Query Base City"]);
  if (phone.length >= 7) return `phone:${phone}`;
  if (isMeaningfulName(email)) return `email:${normalizeIdentity(email)}`;
  if (isMeaningfulName(contact))
    return `contact:${normalizeIdentity(contact)}|${normalizeIdentity(city)}`;
  return `query:${clean(row["Query No."])}`;
};

const agentGroups = new Map();
const clientGroups = new Map();
for (const row of rows) {
  const marketSource = clean(row["Query Market Source"]).toUpperCase();
  const isB2B = marketSource.startsWith("B2B");
  const key = isB2B ? b2bKey(row) : b2cKey(row);
  const groups = isB2B ? agentGroups : clientGroups;
  const group = groups.get(key) || [];
  group.push(row);
  groups.set(key, group);
}

const agentIdByQuery = new Map();
const clientIdByQuery = new Map();
const agentContactIdByQuery = new Map();

const importedAgents = [...agentGroups.entries()]
  .map(([key, group]) => {
    const agencySource = group.map((row) => clean(row["Query Source Name"])).find(isMeaningfulName);
    const contact = lastFilled(group, "Contact Person");
    const phone = lastFilled(group, "Contact Number");
    const alternatePhone = uniqueFilled(group, "Contact Number").find(
      (value) => phoneDigits(value) !== phoneDigits(phone),
    );
    const rawEmail = lastFilled(group, "Email Id");
    const email = isMeaningfulName(rawEmail) ? rawEmail : "";
    const city = lastFilled(group, "Query Base City");
    const owner = lastFilled(group, "Travel Advisor");
    const firstQuery = clean(group[0]["Query No."]);
    const agency =
      agencySource ||
      `${contact || email || phone || `Unnamed agent ${firstQuery}`} — agency name pending`;
    const id = `excel_agent_${stableHash(key)}`;
    const contactGroups = new Map();
    for (const row of group) {
      const contactName = clean(row["Contact Person"]);
      const contactEmail = clean(row["Email Id"]);
      const contactPhone = phoneDigits(row["Contact Number"]);
      const contactKey =
        contactPhone.length >= 7
          ? `phone:${contactPhone}`
          : isMeaningfulName(contactEmail)
            ? `email:${normalizeIdentity(contactEmail)}`
            : isMeaningfulName(contactName)
              ? `name:${normalizeIdentity(contactName)}`
              : "unspecified";
      const contactGroup = contactGroups.get(contactKey) || [];
      contactGroup.push(row);
      contactGroups.set(contactKey, contactGroup);
    }
    const agentContacts = [...contactGroups.entries()].map(
      ([contactKey, contactGroup], contactIndex) => {
        const rawName = lastFilled(contactGroup, "Contact Person");
        const rawContactEmail = lastFilled(contactGroup, "Email Id");
        const contactEmail = isMeaningfulName(rawContactEmail) ? rawContactEmail : "";
        const contactPhone = lastFilled(contactGroup, "Contact Number");
        const contactId = `excel_agent_contact_${stableHash(`${key}|${contactKey}`)}`;
        contactGroup.forEach((row) =>
          agentContactIdByQuery.set(clean(row["Query No."]), contactId),
        );
        return {
          id: contactId,
          contact_code: `CON-${String(contactIndex + 1).padStart(3, "0")}`,
          name: isMeaningfulName(rawName)
            ? rawName
            : contactPhone || contactEmail || "Contact name pending",
          designation: "",
          phone: contactPhone,
          email: contactEmail,
          whatsapp: contactPhone,
          city: lastFilled(contactGroup, "Query Base City"),
          active: true,
          is_primary: false,
          notes: `Imported from ${SOURCE_NAME}; ${contactGroup.length} linked ${contactGroup.length === 1 ? "Query" : "Queries"}.`,
          created_at: businessIso(contactGroup[0]["Query Date"]),
          updated_at: businessIso(contactGroup.at(-1)["Query Date"]),
        };
      },
    );
    const primaryContactId = agentContactIdByQuery.get(clean(group.at(-1)["Query No."]));
    agentContacts.forEach((item) => {
      item.is_primary = item.id === primaryContactId;
    });
    const primaryContact =
      agentContacts.find((item) => item.id === primaryContactId) || agentContacts[0];
    group.forEach((row) => agentIdByQuery.set(clean(row["Query No."]), id));
    const contactNames = agentContacts
      .map((item) => item.name)
      .filter((item) => item !== "Contact name pending")
      .slice(0, 6);
    return {
      id,
      name: primaryContact?.name || contact || agency,
      agency,
      contact_person: primaryContact?.name || contact,
      phone: primaryContact?.phone || phone,
      alt_phone: alternatePhone,
      email: primaryContact?.email || email,
      city,
      country: "India",
      agency_type: "B2B",
      preferred_currency: "INR",
      relationship_owner: owner,
      primary_contact_id: primaryContact?.id,
      contacts: agentContacts,
      notes: `Imported from ${SOURCE_NAME}; ${group.length} linked ${group.length === 1 ? "Query" : "Queries"}.${contactNames.length > 1 ? ` Contacts observed: ${contactNames.join(", ")}.` : ""}`,
      internal_remarks: agencySource
        ? "Imported from the offline Query Tracker."
        : "Agency name was not available in the source workbook and requires review.",
      status: "Active",
      created_at: businessIso(group[0]["Query Date"]),
      updated_at: businessIso(group.at(-1)["Query Date"]),
      created_by: "Excel Import",
    };
  })
  .sort((a, b) => a.agency.localeCompare(b.agency, "en", { sensitivity: "base" }))
  .map((agent, index) => ({
    agent_code: `AGT-${String(index + 1).padStart(6, "0")}`,
    ...agent,
  }));

const importedClients = [...clientGroups.entries()]
  .map(([key, group]) => {
    const contact = lastFilled(group, "Contact Person");
    const phone = lastFilled(group, "Contact Number");
    const rawEmail = lastFilled(group, "Email Id");
    const email = isMeaningfulName(rawEmail) ? rawEmail : "";
    const city = lastFilled(group, "Query Base City");
    const owner = lastFilled(group, "Travel Advisor");
    const firstQuery = clean(group[0]["Query No."]);
    const name = isMeaningfulName(contact) ? contact : `Client ${firstQuery}`;
    const id = `excel_client_${stableHash(key)}`;
    group.forEach((row) => clientIdByQuery.set(clean(row["Query No."]), id));
    return {
      id,
      name,
      mobile: phone,
      email,
      city,
      source: lastFilled(group, "Query Source Type") || "B2C Query",
      relationship_owner: owner,
      notes: `Created from ${SOURCE_NAME}; ${group.length} linked ${group.length === 1 ? "Query" : "Queries"}.`,
      active: true,
      created_at: businessIso(group[0]["Query Date"]),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
  .map((client, index) => ({
    client_code: `CLI-${String(index + 1).padStart(6, "0")}`,
    ...client,
  }));

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
  const contactPerson = clean(row["Contact Person"]);
  const sourceName = clean(row["Query Source Name"]);
  const customer =
    marketSource === "B2C"
      ? contactPerson || sourceName || "Direct Guest"
      : sourceName || contactPerson || "Agent name pending";
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
    contact_person: contactPerson,
    mobile: clean(row["Contact Number"]),
    email: clean(row["Email Id"]),
    market: clean(row["Query Market / Region"]),
    priority: "Normal",
    requirement: queryFor,
    customer_type: marketSource.startsWith("B2B") ? "B2B Agent" : "B2C Client",
    agent_id: marketSource.startsWith("B2B") ? agentIdByQuery.get(queryId) : undefined,
    agent_contact_id: marketSource.startsWith("B2B")
      ? agentContactIdByQuery.get(queryId)
      : undefined,
    client_id: marketSource === "B2C" ? clientIdByQuery.get(queryId) : undefined,
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

const agentIds = new Set(importedAgents.map((agent) => agent.id));
const agentContactIds = new Map(
  importedAgents.map((agent) => [agent.id, new Set(agent.contacts.map((contact) => contact.id))]),
);
const clientIds = new Set(importedClients.map((client) => client.id));
const unlinkedRelationships = queries.filter((query) =>
  query.customer_type === "B2B Agent"
    ? !query.agent_id || !agentIds.has(query.agent_id)
    : !query.client_id || !clientIds.has(query.client_id),
);
if (unlinkedRelationships.length)
  throw new Error(
    `Queries without a valid relationship link: ${unlinkedRelationships
      .map((query) => query.query_id)
      .join(", ")}`,
  );
const unlinkedAgentContacts = queries.filter(
  (query) =>
    query.customer_type === "B2B Agent" &&
    (!query.agent_contact_id ||
      !query.agent_id ||
      !agentContactIds.get(query.agent_id)?.has(query.agent_contact_id)),
);
if (unlinkedAgentContacts.length)
  throw new Error(
    `B2B Queries without a valid Agent contact link: ${unlinkedAgentContacts
      .map((query) => query.query_id)
      .join(", ")}`,
  );

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
const relationshipModuleText = `${banner}\nimport type { Client } from "./clients-store";\nimport type { Agent } from "../wizard/agents-store";\n\nexport const RELATIONSHIP_MASTER_DATASET_ID = ${JSON.stringify(RELATIONSHIP_DATASET_ID)};\nexport const IMPORTED_RELATIONSHIP_MANIFEST = ${JSON.stringify({ source: SOURCE_NAME, sheet: "QTS - EMP", b2bRows: rows.filter((row) => clean(row["Query Market Source"]) === "B2B").length, b2cRows: rows.filter((row) => clean(row["Query Market Source"]) === "B2C").length, agentCount: importedAgents.length, agentContactCount: importedAgents.reduce((sum, agent) => sum + agent.contacts.length, 0), clientCount: importedClients.length }, null, 2)} as const;\n\nexport const IMPORTED_B2B_AGENTS: Agent[] = ${JSON.stringify(importedAgents, null, 2)};\n\nexport const IMPORTED_B2C_CLIENTS: Client[] = ${JSON.stringify(importedClients, null, 2)};\n`;
fs.writeFileSync(
  RELATIONSHIP_OUTPUT,
  await format(relationshipModuleText, { ...prettierOptions, parser: "typescript" }),
  "utf8",
);
console.log(`Generated ${path.relative(ROOT, OUTPUT)}`);
console.log(`Generated ${path.relative(ROOT, RELATIONSHIP_OUTPUT)}`);
console.log(`Queries: ${queries.length}; tasks: ${tasks.length}; events: ${events.length}`);
console.log(
  `Relationships: ${importedAgents.length} B2B agents; ${importedAgents.reduce((sum, agent) => sum + agent.contacts.length, 0)} B2B contacts; ${importedClients.length} B2C clients`,
);
console.log(`Stages: ${JSON.stringify(counts)}; value: ${totalValue.toFixed(2)}`);

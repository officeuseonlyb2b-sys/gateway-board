// Wizard mock stores for agents & saved programs (localStorage-backed).
import { useSyncExternalStore } from "react";
import {
  IMPORTED_B2B_AGENTS,
  RELATIONSHIP_MASTER_DATASET_ID,
} from "@/lib/crm/relationship-master-import.generated";
import {
  IMPORTED_PROGRAMS,
  PROGRAM_MASTER_DATASET_ID,
} from "@/lib/wizard/program-master-import.generated";

export type AgentStatus = "Active" | "Inactive" | "Prospect" | "Dormant";

export interface AgentContact {
  id: string;
  contact_code?: string;
  name: string;
  designation?: string;
  phone: string;
  alt_phone?: string;
  email: string;
  whatsapp?: string;
  gender?: string;
  city?: string;
  notes?: string;
  active: boolean;
  is_primary?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Agent {
  id: string;
  agent_code?: string;
  // Basic
  name: string;
  agency: string;
  contact_person?: string;
  phone: string;
  alt_phone?: string;
  email: string;
  website?: string;
  // Address
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  // Business
  gst_number?: string;
  pan_number?: string;
  iata?: string;
  agency_type?: string;
  preferred_currency?: string;
  credit_limit?: number;
  payment_terms?: string;
  // Communication
  whatsapp?: string;
  notes?: string;
  internal_remarks?: string;
  relationship_owner?: string;
  designation?: string;
  gender?: string;
  specializations?: string[];
  // Status
  status?: AgentStatus;
  // Audit
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  /** Company contacts. Legacy single-contact fields mirror the primary contact. */
  primary_contact_id?: string;
  contacts?: AgentContact[];
}

export interface ProgramRoutingRow {
  day: number;
  overnight_city: string | null;
  program_text: string;
  from_city?: string;
  destination_city?: string;
}
export type ProgramSource = "Excel Import" | "Query History" | "Quotation Builder" | "Manual";
export type ProgramStatus = "Active" | "Draft" | "Archived";
export interface SavedProgram {
  id: string;
  code: string;
  name: string;
  nights: number;
  days: number;
  duration_label: string;
  routing_summary: string;
  routing: ProgramRoutingRow[];
  cities: string[];
  categories: string[];
  departure_city?: string;
  travel_modes?: string[];
  inclusions?: string[];
  exclusions?: string[];
  source: ProgramSource;
  status: ProgramStatus;
  name_missing?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

const AGENTS_KEY = "mp_tourism_agents";
const AGENTS_DATASET_KEY = "mp_tourism_agents_dataset_revision";
const PROGRAMS_KEY = "mp_tourism_programs";
const PROGRAMS_DATASET_KEY = "mp_tourism_programs_dataset_revision";
const isBrowser = () => typeof window !== "undefined";

const agentListeners = new Set<() => void>();
const programListeners = new Set<() => void>();
let agentCache: Agent[] = [];
let programCache: SavedProgram[] = [];
let aInit = false;
let pInit = false;

function nowIso() {
  return new Date().toISOString();
}

function seedAgents(): Agent[] {
  return normalizeAgents(JSON.parse(JSON.stringify(IMPORTED_B2B_AGENTS)) as Agent[]);
}
function seedPrograms(): SavedProgram[] {
  const imported = IMPORTED_PROGRAMS.map((program) => ({
    ...program,
    cities: [...program.cities],
    routing: program.routing ? [...program.routing] : [],
    categories: [],
    source: program.source as ProgramSource,
    status: program.status as ProgramStatus,
  }));
  const queryHistoryPrograms: SavedProgram[] = [
    {
      id: "EXNAG02",
      code: "EXNAG02",
      name: "Tales from the Tiger Trail",
      nights: 7,
      days: 8,
      duration_label: "7 Nights & 8 Days",
      routing_summary: "Ex Nag - 2N Tado - 2N Pen - 3N Nag",
      routing: [],
      cities: ["Pench"],
      categories: ["Wildlife"],
      source: "Query History",
      status: "Active",
    },
    {
      id: "EXNAG03",
      code: "EXNAG03",
      name: "Echoes of the Heartland",
      nights: 10,
      days: 11,
      duration_label: "10 Nights & 11 Days",
      routing_summary: "2N Pen - 2N Kan - 2N Ban - 2N Pan - 2N Hjr",
      routing: [],
      cities: ["Pench", "Kanha", "Bandhavgarh", "Panna", "Khajuraho"],
      categories: ["Wildlife", "Heritage"],
      source: "Query History",
      status: "Active",
    },
  ];
  return [...imported, ...queryHistoryPrograms];
}

function normalizeProgram(
  program: Partial<SavedProgram> & Pick<SavedProgram, "id" | "name" | "nights">,
): SavedProgram {
  const code = (program.code || program.id).trim().toUpperCase();
  const days = program.days || Math.max(1, program.nights + 1);
  return {
    id: program.id || code,
    code,
    name: program.name?.trim() || `Unnamed Program — ${code}`,
    nights: Math.max(0, Number(program.nights) || 0),
    days,
    duration_label: program.duration_label || `${program.nights} Nights & ${days} Days`,
    routing_summary: program.routing_summary || "",
    routing: program.routing || [],
    cities: program.cities || [],
    categories: program.categories || [],
    departure_city: program.departure_city,
    travel_modes: program.travel_modes || [],
    inclusions: program.inclusions || [],
    exclusions: program.exclusions || [],
    source: program.source || "Manual",
    status: program.status || "Active",
    name_missing: program.name_missing,
    created_at: program.created_at,
    updated_at: program.updated_at,
    created_by: program.created_by,
  };
}

function mergeImportedPrograms(existing: SavedProgram[]) {
  const byCode = new Map(
    existing.map((program) => [program.code.toUpperCase(), normalizeProgram(program)]),
  );
  for (const imported of seedPrograms()) {
    const current = byCode.get(imported.code);
    const shouldRefreshImportedRouting =
      current &&
      current.routing.length === 0 &&
      imported.routing.length > 0 &&
      (current.source === "Excel Import" || current.source === "Query History");
    byCode.set(
      imported.code,
      current
        ? normalizeProgram({
            ...imported,
            ...current,
            ...(shouldRefreshImportedRouting ? { routing: imported.routing } : {}),
            id: imported.id,
            code: imported.code,
          })
        : imported,
    );
  }
  return [...byCode.values()].sort((left, right) => left.code.localeCompare(right.code));
}

function readAgents(): Agent[] {
  if (!isBrowser()) return seedAgents();
  try {
    const raw = localStorage.getItem(AGENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Agent[]) : [];
    if (Array.isArray(parsed)) {
      const withDefaults = normalizeAgents(
        parsed.map((a) => ({
          status: "Active" as AgentStatus,
          country: "India",
          created_at: a.created_at || nowIso(),
          updated_at: a.updated_at || nowIso(),
          ...a,
        })),
      );
      if (localStorage.getItem(AGENTS_DATASET_KEY) === RELATIONSHIP_MASTER_DATASET_ID) {
        return withDefaults;
      }
      const merged = mergeImportedAgents(withDefaults);
      localStorage.setItem(AGENTS_KEY, JSON.stringify(merged));
      localStorage.setItem(AGENTS_DATASET_KEY, RELATIONSHIP_MASTER_DATASET_ID);
      return merged;
    }
  } catch {
    /* fall through */
  }
  const s = seedAgents();
  localStorage.setItem(AGENTS_KEY, JSON.stringify(s));
  localStorage.setItem(AGENTS_DATASET_KEY, RELATIONSHIP_MASTER_DATASET_ID);
  return s;
}
function readPrograms(): SavedProgram[] {
  if (!isBrowser()) return seedPrograms();
  try {
    const raw = localStorage.getItem(PROGRAMS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedProgram[]) : [];
    const normalized = parsed.map((program) => normalizeProgram(program));
    if (localStorage.getItem(PROGRAMS_DATASET_KEY) === PROGRAM_MASTER_DATASET_ID) {
      return normalized;
    }
    const merged = mergeImportedPrograms(normalized);
    localStorage.setItem(PROGRAMS_KEY, JSON.stringify(merged));
    localStorage.setItem(PROGRAMS_DATASET_KEY, PROGRAM_MASTER_DATASET_ID);
    return merged;
  } catch {
    /* fall through */
  }
  const s = seedPrograms();
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(s));
  localStorage.setItem(PROGRAMS_DATASET_KEY, PROGRAM_MASTER_DATASET_ID);
  return s;
}

function persistAgents(list: Agent[]) {
  localStorage.setItem(AGENTS_KEY, JSON.stringify(list));
  refreshA();
  agentListeners.forEach((l) => l());
}

export function addProgram(p: Omit<SavedProgram, "id"> & { id?: string }): SavedProgram {
  const np = normalizeProgram({ ...p, id: p.id || p.code });
  const list = readPrograms();
  const existing = list.findIndex((program) => program.code === np.code);
  if (existing >= 0) list[existing] = { ...list[existing], ...np, updated_at: nowIso() };
  else list.push({ ...np, created_at: np.created_at || nowIso(), updated_at: nowIso() });
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(list));
  refreshP();
  programListeners.forEach((l) => l());
  return np;
}

export function nextProgramCode(programs = readPrograms()) {
  const year = new Date().getFullYear();
  const prefix = `MPCUS${String(year).slice(-2)}`;
  const sequence =
    programs.reduce((max, program) => {
      const match = program.code.match(new RegExp(`^${prefix}(\\d{3})$`));
      return Math.max(max, Number(match?.[1] || 0));
    }, 0) + 1;
  return `${prefix}${String(sequence).padStart(3, "0")}`;
}

export function getPrograms(): SavedProgram[] {
  return readPrograms();
}

function refreshA() {
  agentCache = readAgents();
  aInit = true;
}
function refreshP() {
  programCache = readPrograms();
  pInit = true;
}

const norm = (s?: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const emailKey = (s?: string) => {
  const value = norm(s);
  return ["", "-", "na", "n/a", "unknown"].includes(value) ? "" : value;
};
const phoneKey = (s?: string) => {
  const value = (s || "").replace(/\D/g, "");
  return value.length >= 7 ? value : "";
};

function agentsMatch(left: Agent, right: Agent) {
  if (norm(left.agency) && norm(left.agency) === norm(right.agency)) return true;
  if (emailKey(left.email) && emailKey(left.email) === emailKey(right.email)) return true;
  if (phoneKey(left.phone) && phoneKey(left.phone) === phoneKey(right.phone)) return true;
  return false;
}

function contactKey(contact: Pick<AgentContact, "name" | "phone" | "email">) {
  return phoneKey(contact.phone) || emailKey(contact.email) || norm(contact.name);
}

function normalizeAgent(agent: Agent): Agent {
  const now = agent.created_at || nowIso();
  const supplied = (agent.contacts || []).map((contact, index) => ({
    ...contact,
    id: contact.id || `contact_${agent.id}_${index + 1}`,
    name: contact.name || agent.contact_person || agent.name || "Contact pending",
    phone: contact.phone || "",
    email: contact.email || "",
    active: contact.active !== false,
    created_at: contact.created_at || now,
    updated_at: contact.updated_at || agent.updated_at || now,
  }));
  const contacts: AgentContact[] = supplied.length
    ? supplied
    : [
        {
          id: `legacy_contact_${agent.id}`,
          contact_code: agent.agent_code ? `${agent.agent_code}-C01` : undefined,
          name: agent.contact_person || agent.name || "Contact pending",
          designation: agent.designation,
          phone: agent.phone || "",
          alt_phone: agent.alt_phone,
          email: agent.email || "",
          whatsapp: agent.whatsapp,
          gender: agent.gender,
          city: agent.city,
          notes: agent.notes,
          active: true,
          is_primary: true,
          created_at: now,
          updated_at: agent.updated_at || now,
        },
      ];
  let primaryId = agent.primary_contact_id;
  if (!primaryId || !contacts.some((contact) => contact.id === primaryId)) {
    primaryId = contacts.find((contact) => contact.is_primary)?.id || contacts[0]?.id;
  }
  const normalized = contacts.map((contact) => ({
    ...contact,
    is_primary: contact.id === primaryId,
  }));
  const primary = normalized.find((contact) => contact.id === primaryId) || normalized[0];
  return {
    ...agent,
    primary_contact_id: primary?.id,
    contacts: normalized,
    contact_person: primary?.name || agent.contact_person,
    phone: primary?.phone || agent.phone || "",
    email: primary?.email || agent.email || "",
    alt_phone: primary?.alt_phone || agent.alt_phone,
    whatsapp: primary?.whatsapp || agent.whatsapp,
    designation: primary?.designation || agent.designation,
    gender: primary?.gender || agent.gender,
  };
}

function normalizeAgents(list: Agent[]) {
  return list.map(normalizeAgent);
}

function mergeContacts(current: AgentContact[] = [], imported: AgentContact[] = []) {
  const merged = current.map((contact) => ({ ...contact }));
  for (const candidate of imported) {
    const key = contactKey(candidate);
    const index = merged.findIndex(
      (contact) => contact.id === candidate.id || (key && contactKey(contact) === key),
    );
    if (index < 0) merged.push({ ...candidate });
    else merged[index] = { ...candidate, ...merged[index] };
  }
  return merged;
}

function mergeImportedAgents(existing: Agent[]): Agent[] {
  const merged = normalizeAgents(existing);
  for (const imported of IMPORTED_B2B_AGENTS) {
    const index = merged.findIndex((agent) => agentsMatch(agent, imported));
    if (index < 0) {
      merged.push(normalizeAgent({ ...imported }));
      continue;
    }
    const current = merged[index];
    merged[index] = normalizeAgent({
      ...imported,
      ...current,
      name: current.name || imported.name,
      agency: current.agency || imported.agency,
      contact_person: current.contact_person || imported.contact_person,
      phone: current.phone || imported.phone,
      alt_phone: current.alt_phone || imported.alt_phone,
      email: current.email || imported.email,
      city: current.city || imported.city,
      relationship_owner: current.relationship_owner || imported.relationship_owner,
      notes: current.notes || imported.notes,
      internal_remarks: current.internal_remarks || imported.internal_remarks,
      contacts: mergeContacts(current.contacts, imported.contacts),
      primary_contact_id: current.primary_contact_id || imported.primary_contact_id,
    });
  }
  return merged.sort((a, b) => a.agency.localeCompare(b.agency, "en", { sensitivity: "base" }));
}

export function findAgentByIdentity(input: {
  id?: string;
  agency?: string;
  email?: string;
  phone?: string;
}): Agent | undefined {
  return readAgents().find((agent) => {
    if (input.id && agent.id === input.id) return true;
    if (input.agency && norm(agent.agency) === norm(input.agency)) return true;
    if (emailKey(input.email) && emailKey(agent.email) === emailKey(input.email)) return true;
    if (phoneKey(input.phone) && phoneKey(agent.phone) === phoneKey(input.phone)) return true;
    return false;
  });
}

export function findDuplicateAgent(
  input: { email?: string; phone?: string },
  ignoreId?: string,
): Agent | undefined {
  const list = readAgents();
  const email = emailKey(input.email);
  const phone = phoneKey(input.phone);
  return list.find((a) => {
    if (ignoreId && a.id === ignoreId) return false;
    if (email && emailKey(a.email) === email) return true;
    if (phone && phoneKey(a.phone) === phone) return true;
    return false;
  });
}

export function addAgent(a: Omit<Agent, "id" | "created_at" | "updated_at">): Agent {
  const now = nowIso();
  const list = readAgents();
  const ag = normalizeAgent({
    status: "Active",
    country: "India",
    agent_code: `AGT-${String(list.length + 1).padStart(6, "0")}`,
    ...a,
    id: "ag_" + Math.random().toString(36).slice(2, 8),
    created_at: now,
    updated_at: now,
  });
  list.push(ag);
  persistAgents(list);
  return ag;
}

export function updateAgent(
  id: string,
  patch: Partial<Omit<Agent, "id" | "created_at">>,
): Agent | undefined {
  const list = readAgents();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const current = list[idx];
  let contacts = patch.contacts || current.contacts;
  const primaryId = patch.primary_contact_id || current.primary_contact_id;
  const primaryFieldsChanged = [
    "contact_person",
    "phone",
    "alt_phone",
    "email",
    "whatsapp",
    "designation",
    "gender",
  ].some((field) => Object.prototype.hasOwnProperty.call(patch, field));
  if (!patch.contacts && primaryFieldsChanged && contacts?.length) {
    contacts = contacts.map((contact) =>
      contact.id === primaryId
        ? {
            ...contact,
            name: patch.contact_person ?? contact.name,
            phone: patch.phone ?? contact.phone,
            alt_phone: patch.alt_phone ?? contact.alt_phone,
            email: patch.email ?? contact.email,
            whatsapp: patch.whatsapp ?? contact.whatsapp,
            designation: patch.designation ?? contact.designation,
            gender: patch.gender ?? contact.gender,
            updated_at: nowIso(),
          }
        : contact,
    );
  }
  const updated = normalizeAgent({ ...current, ...patch, contacts, updated_at: nowIso() });
  list[idx] = updated;
  persistAgents(list);
  return updated;
}

export function deleteAgent(id: string): void {
  persistAgents(readAgents().filter((a) => a.id !== id));
}

export function getAgent(id: string): Agent | undefined {
  return readAgents().find((a) => a.id === id);
}

export function findAgentContact(agentId: string, contactId?: string): AgentContact | undefined {
  const agent = getAgent(agentId);
  if (!agent) return undefined;
  return agent.contacts?.find((contact) => contact.id === contactId);
}

export function addAgentContact(
  agentId: string,
  input: Omit<AgentContact, "id" | "created_at" | "updated_at" | "contact_code">,
): AgentContact | undefined {
  const agent = getAgent(agentId);
  if (!agent) return undefined;
  const now = nowIso();
  const contacts = agent.contacts || [];
  const contact: AgentContact = {
    ...input,
    id: `contact_${agentId}_${Date.now()}`,
    contact_code: `${agent.agent_code || "AGT"}-C${String(contacts.length + 1).padStart(2, "0")}`,
    active: input.active !== false,
    is_primary: input.is_primary || contacts.length === 0,
    created_at: now,
    updated_at: now,
  };
  updateAgent(agentId, {
    contacts: contact.is_primary
      ? [...contacts.map((item) => ({ ...item, is_primary: false })), contact]
      : [...contacts, contact],
    primary_contact_id: contact.is_primary ? contact.id : agent.primary_contact_id,
  });
  return contact;
}

export function updateAgentContact(
  agentId: string,
  contactId: string,
  patch: Partial<Omit<AgentContact, "id" | "created_at">>,
) {
  const agent = getAgent(agentId);
  const current = agent?.contacts?.find((contact) => contact.id === contactId);
  if (!agent || !current) return undefined;
  const contacts = (agent.contacts || []).map((contact) =>
    contact.id === contactId ? { ...contact, ...patch, updated_at: nowIso() } : contact,
  );
  return updateAgent(agentId, {
    contacts: patch.is_primary
      ? contacts.map((contact) => ({ ...contact, is_primary: contact.id === contactId }))
      : contacts,
    primary_contact_id: patch.is_primary ? contactId : agent.primary_contact_id,
  })?.contacts?.find((contact) => contact.id === contactId);
}

export function deactivateAgentContact(agentId: string, contactId: string) {
  return updateAgentContact(agentId, contactId, { active: false, is_primary: false });
}

export function useAgents(): Agent[] {
  return useSyncExternalStore(
    (cb) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== AGENTS_KEY) return;
        refreshA();
        cb();
      };
      agentListeners.add(cb);
      if (isBrowser()) window.addEventListener("storage", onStorage);
      return () => {
        agentListeners.delete(cb);
        if (isBrowser()) window.removeEventListener("storage", onStorage);
      };
    },
    () => {
      if (!aInit) refreshA();
      return agentCache;
    },
    () => [],
  );
}
export function usePrograms(): SavedProgram[] {
  return useSyncExternalStore(
    (cb) => {
      programListeners.add(cb);
      return () => programListeners.delete(cb);
    },
    () => {
      if (!pInit) refreshP();
      return programCache;
    },
    () => [],
  );
}

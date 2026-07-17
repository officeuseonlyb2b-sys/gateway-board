// Wizard mock stores for agents & saved programs (localStorage-backed).
import { useSyncExternalStore } from "react";

export type AgentStatus = "Active" | "Inactive";

export interface Agent {
  id: string;
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
  // Status
  status?: AgentStatus;
  // Audit
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export interface ProgramRoutingRow {
  day: number;
  overnight_city: string | null;
  program_text: string;
}
export interface SavedProgram {
  id: string;
  name: string;
  nights: number;
  routing: ProgramRoutingRow[];
  categories: string[];
  departure_city?: string;
  travel_modes?: string[];
  inclusions?: string[];
  exclusions?: string[];
}

const AGENTS_KEY = "mp_tourism_agents";
const PROGRAMS_KEY = "mp_tourism_programs";
const isBrowser = () => typeof window !== "undefined";

const agentListeners = new Set<() => void>();
const programListeners = new Set<() => void>();
let agentCache: Agent[] = [];
let programCache: SavedProgram[] = [];
let aInit = false;
let pInit = false;

function nowIso() { return new Date().toISOString(); }

function seedAgents(): Agent[] {
  const now = nowIso();
  return [
    { id: "ag1", name: "Rahul Verma", agency: "SkyWings Travels", contact_person: "Rahul Verma", phone: "+91 98100 12345", email: "rahul@skywings.in", city: "Delhi", state: "Delhi", country: "India", status: "Active", created_at: now, updated_at: now },
    { id: "ag2", name: "Sneha Kapoor", agency: "Heritage Trails", contact_person: "Sneha Kapoor", phone: "+91 98800 55600", email: "sneha@heritagetrails.in", city: "Mumbai", state: "Maharashtra", country: "India", status: "Active", created_at: now, updated_at: now },
    { id: "ag3", name: "Vikram Rao", agency: "Golden Path Holidays", contact_person: "Vikram Rao", phone: "+91 97400 90011", email: "vikram@goldenpath.in", city: "Bengaluru", state: "Karnataka", country: "India", status: "Active", created_at: now, updated_at: now },
  ];
}
function seedPrograms(): SavedProgram[] {
  const defaultInclusions = ["Accommodation on twin sharing", "Daily breakfast", "All transfers & sightseeing by AC vehicle", "All applicable taxes"];
  const defaultExclusions = ["Airfare / train fare unless specified", "Lunch & dinner unless specified", "Personal expenses (laundry, tips, phone calls)", "Anything not mentioned in inclusions"];
  return [
    {
      id: "pg1", name: "Classic Golden Triangle", nights: 5, categories: ["Heritage", "Cultural"],
      departure_city: "Bhopal", travel_modes: ["car"],
      routing: [
        { day: 1, overnight_city: "Bhopal", program_text: "Arrival at Bhopal, check-in, evening city tour." },
        { day: 2, overnight_city: "Khajuraho", program_text: "Bhopal to Khajuraho via Sanchi Stupa." },
        { day: 3, overnight_city: "Khajuraho", program_text: "Khajuraho temples — Western & Eastern groups." },
        { day: 4, overnight_city: "Orchha", program_text: "Khajuraho to Orchha, Orchha fort visit." },
        { day: 5, overnight_city: "Bhopal", program_text: "Orchha to Bhopal, en-route sightseeing." },
        { day: 6, overnight_city: null, program_text: "Departure from Bhopal." },
      ],
      inclusions: defaultInclusions, exclusions: defaultExclusions,
    },
    {
      id: "pg2", name: "MP Wildlife Circuit", nights: 6, categories: ["Wildlife", "Heritage"],
      departure_city: "Bhopal", travel_modes: ["car"],
      routing: [
        { day: 1, overnight_city: "Bhopal", program_text: "Arrival at Bhopal, check-in, city tour." },
        { day: 2, overnight_city: "Indore", program_text: "Bhopal to Indore via Sanchi Stupa." },
        { day: 3, overnight_city: "Khajuraho", program_text: "Indore to Khajuraho, temple visit." },
        { day: 4, overnight_city: "Gwalior", program_text: "Khajuraho temples morning, drive to Gwalior." },
        { day: 5, overnight_city: "Ujjain", program_text: "Gwalior Fort, Jai Vilas Palace, drive to Ujjain." },
        { day: 6, overnight_city: "Jabalpur", program_text: "Mahakaleshwar temple, drive to Jabalpur." },
        { day: 7, overnight_city: null, program_text: "Marble Rocks, Dhuandhar Falls, departure." },
      ],
      inclusions: defaultInclusions, exclusions: defaultExclusions,
    },
    {
      id: "pg3", name: "Khajuraho Heritage Escape", nights: 3, categories: ["Heritage"],
      departure_city: "Bhopal", travel_modes: ["car"],
      routing: [
        { day: 1, overnight_city: "Bhopal", program_text: "Arrival at Bhopal, check-in." },
        { day: 2, overnight_city: "Khajuraho", program_text: "Bhopal to Khajuraho." },
        { day: 3, overnight_city: "Orchha", program_text: "Khajuraho temples, drive to Orchha." },
        { day: 4, overnight_city: null, program_text: "Orchha sightseeing, departure." },
      ],
      inclusions: defaultInclusions, exclusions: defaultExclusions,
    },
  ];
}

function readAgents(): Agent[] {
  if (!isBrowser()) return seedAgents();
  try {
    const raw = localStorage.getItem(AGENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Agent[];
      // Backfill defaults for older records
      return parsed.map((a) => ({
        status: "Active" as AgentStatus,
        country: "India",
        created_at: a.created_at || nowIso(),
        updated_at: a.updated_at || nowIso(),
        ...a,
      }));
    }
  } catch { /* fall through */ }
  const s = seedAgents();
  localStorage.setItem(AGENTS_KEY, JSON.stringify(s));
  return s;
}
function readPrograms(): SavedProgram[] {
  if (!isBrowser()) return seedPrograms();
  try {
    const raw = localStorage.getItem(PROGRAMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedProgram[];
      if (parsed.length > 0 && parsed[0].routing && parsed[0].routing.length > 0) return parsed;
    }
  } catch { /* fall through */ }
  const s = seedPrograms();
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(s));
  return s;
}

function persistAgents(list: Agent[]) {
  localStorage.setItem(AGENTS_KEY, JSON.stringify(list));
  refreshA();
  agentListeners.forEach((l) => l());
}

export function addProgram(p: Omit<SavedProgram, "id">): SavedProgram {
  const np: SavedProgram = { ...p, id: "pg_" + Math.random().toString(36).slice(2, 8) };
  const list = readPrograms();
  list.push(np);
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(list));
  refreshP();
  programListeners.forEach((l) => l());
  return np;
}

function refreshA() { agentCache = readAgents(); aInit = true; }
function refreshP() { programCache = readPrograms(); pInit = true; }

const norm = (s?: string) => (s || "").trim().toLowerCase();

export function findDuplicateAgent(
  input: { email?: string; phone?: string },
  ignoreId?: string,
): Agent | undefined {
  const list = readAgents();
  const email = norm(input.email);
  const phone = norm(input.phone).replace(/\s+/g, "");
  return list.find((a) => {
    if (ignoreId && a.id === ignoreId) return false;
    if (email && norm(a.email) === email) return true;
    if (phone && norm(a.phone).replace(/\s+/g, "") === phone) return true;
    return false;
  });
}

export function addAgent(a: Omit<Agent, "id" | "created_at" | "updated_at">): Agent {
  const now = nowIso();
  const ag: Agent = {
    status: "Active",
    country: "India",
    ...a,
    id: "ag_" + Math.random().toString(36).slice(2, 8),
    created_at: now,
    updated_at: now,
  };
  const list = readAgents();
  list.push(ag);
  persistAgents(list);
  return ag;
}

export function updateAgent(id: string, patch: Partial<Omit<Agent, "id" | "created_at">>): Agent | undefined {
  const list = readAgents();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const updated: Agent = { ...list[idx], ...patch, updated_at: nowIso() };
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

export function useAgents(): Agent[] {
  return useSyncExternalStore(
    (cb) => { agentListeners.add(cb); return () => agentListeners.delete(cb); },
    () => { if (!aInit) refreshA(); return agentCache; },
    () => [],
  );
}
export function usePrograms(): SavedProgram[] {
  return useSyncExternalStore(
    (cb) => { programListeners.add(cb); return () => programListeners.delete(cb); },
    () => { if (!pInit) refreshP(); return programCache; },
    () => [],
  );
}

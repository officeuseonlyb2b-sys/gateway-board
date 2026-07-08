// Wizard mock stores for agents & saved programs (localStorage-backed).
import { useSyncExternalStore } from "react";

export interface Agent {
  id: string;
  name: string;
  agency: string;
  phone: string;
  email: string;
}
export interface ProgramRoutingRow {
  day: number;
  overnight_city: string | null; // city NAME; null = departure day
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

function seedAgents(): Agent[] {
  return [
    { id: "ag1", name: "Rahul Verma", agency: "SkyWings Travels", phone: "+91 98100 12345", email: "rahul@skywings.in" },
    { id: "ag2", name: "Sneha Kapoor", agency: "Heritage Trails", phone: "+91 98800 55600", email: "sneha@heritagetrails.in" },
    { id: "ag3", name: "Vikram Rao", agency: "Golden Path Holidays", phone: "+91 97400 90011", email: "vikram@goldenpath.in" },
  ];
}
function seedPrograms(): SavedProgram[] {
  const defaultInclusions = ["Accommodation on twin sharing", "Daily breakfast", "All transfers & sightseeing by AC vehicle", "All applicable taxes"];
  const defaultExclusions = ["Airfare / train fare unless specified", "Lunch & dinner unless specified", "Personal expenses (laundry, tips, phone calls)", "Anything not mentioned in inclusions"];
  return [
    {
      id: "pg1",
      name: "Classic Golden Triangle",
      nights: 5,
      categories: ["Heritage", "Cultural"],
      departure_city: "Bhopal",
      travel_modes: ["car"],
      routing: [
        { day: 1, overnight_city: "Bhopal", program_text: "Arrival at Bhopal, check-in, evening city tour." },
        { day: 2, overnight_city: "Khajuraho", program_text: "Bhopal to Khajuraho via Sanchi Stupa." },
        { day: 3, overnight_city: "Khajuraho", program_text: "Khajuraho temples — Western & Eastern groups." },
        { day: 4, overnight_city: "Orchha", program_text: "Khajuraho to Orchha, Orchha fort visit." },
        { day: 5, overnight_city: "Bhopal", program_text: "Orchha to Bhopal, en-route sightseeing." },
        { day: 6, overnight_city: null, program_text: "Departure from Bhopal." },
      ],
      inclusions: defaultInclusions,
      exclusions: defaultExclusions,
    },
    {
      id: "pg2",
      name: "MP Wildlife Circuit",
      nights: 6,
      categories: ["Wildlife", "Heritage"],
      departure_city: "Bhopal",
      travel_modes: ["car"],
      routing: [
        { day: 1, overnight_city: "Bhopal", program_text: "Arrival at Bhopal, check-in, city tour." },
        { day: 2, overnight_city: "Indore", program_text: "Bhopal to Indore via Sanchi Stupa." },
        { day: 3, overnight_city: "Khajuraho", program_text: "Indore to Khajuraho, temple visit." },
        { day: 4, overnight_city: "Gwalior", program_text: "Khajuraho temples morning, drive to Gwalior." },
        { day: 5, overnight_city: "Ujjain", program_text: "Gwalior Fort, Jai Vilas Palace, drive to Ujjain." },
        { day: 6, overnight_city: "Jabalpur", program_text: "Mahakaleshwar temple, drive to Jabalpur." },
        { day: 7, overnight_city: null, program_text: "Marble Rocks, Dhuandhar Falls, departure." },
      ],
      inclusions: defaultInclusions,
      exclusions: defaultExclusions,
    },
    {
      id: "pg3",
      name: "Khajuraho Heritage Escape",
      nights: 3,
      categories: ["Heritage"],
      departure_city: "Bhopal",
      travel_modes: ["car"],
      routing: [
        { day: 1, overnight_city: "Bhopal", program_text: "Arrival at Bhopal, check-in." },
        { day: 2, overnight_city: "Khajuraho", program_text: "Bhopal to Khajuraho." },
        { day: 3, overnight_city: "Orchha", program_text: "Khajuraho temples, drive to Orchha." },
        { day: 4, overnight_city: null, program_text: "Orchha sightseeing, departure." },
      ],
      inclusions: defaultInclusions,
      exclusions: defaultExclusions,
    },
  ];
}

function readAgents(): Agent[] {
  if (!isBrowser()) return seedAgents();
  try {
    const raw = localStorage.getItem(AGENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
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
      // If old empty-routing seed is cached, refresh with new rich seed.
      if (parsed.length > 0 && parsed[0].routing && parsed[0].routing.length > 0) return parsed;
    }
  } catch {}
  const s = seedPrograms();
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(s));
  return s;
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

export function addAgent(a: Omit<Agent, "id">): Agent {
  const ag: Agent = { ...a, id: "ag_" + Math.random().toString(36).slice(2, 8) };
  const list = readAgents();
  list.push(ag);
  localStorage.setItem(AGENTS_KEY, JSON.stringify(list));
  refreshA();
  agentListeners.forEach((l) => l());
  return ag;
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

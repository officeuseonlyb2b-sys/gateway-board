// Wizard mock stores for agents & saved programs (localStorage-backed).
import { useSyncExternalStore } from "react";

export interface Agent {
  id: string;
  name: string;
  agency: string;
  phone: string;
  email: string;
}
export interface SavedProgram {
  id: string;
  name: string;
  nights: number;
  routing: { city_id: string; program: string }[];
  categories: string[];
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
  return [
    { id: "pg1", name: "Classic Golden Triangle", nights: 5, routing: [], categories: ["Heritage", "Cultural"] },
    { id: "pg2", name: "MP Wildlife Circuit", nights: 6, routing: [], categories: ["Wildlife"] },
    { id: "pg3", name: "Khajuraho Heritage Escape", nights: 3, routing: [], categories: ["Heritage"] },
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
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = seedPrograms();
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(s));
  return s;
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

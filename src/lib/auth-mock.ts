// Tiny mock auth — replace with Supabase later. Two pre-seeded users.
import { useSyncExternalStore } from "react";

export type Role = "admin" | "staff";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
}

const KEY = "mp-tourism-auth-v1";

const SEED_USERS: Array<AuthUser & { password: string }> = [
  { id: "u_admin", email: "admin@mptourism.in", name: "Aarav Sharma", role: "admin", password: "admin123", avatarUrl: null },
  { id: "u_staff", email: "staff@mptourism.in", name: "Maya Iyer", role: "staff", password: "staff123", avatarUrl: null },
];

let current: AuthUser | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) current = JSON.parse(raw) as AuthUser;
  } catch {/* */}
}

function persist() {
  if (typeof window === "undefined") return;
  if (current) localStorage.setItem(KEY, JSON.stringify(current));
  else localStorage.removeItem(KEY);
}

function emit() { listeners.forEach((l) => l()); }

export const auth = {
  current(): AuthUser | null { load(); return current; },
  subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  async signIn(email: string, password: string): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    await new Promise((r) => setTimeout(r, 350));
    const u = SEED_USERS.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
    if (!u) return { ok: false, error: "Invalid email or password." };
    const { password: _pw, ...safe } = u;
    current = safe;
    persist(); emit();
    return { ok: true, user: safe };
  },
  signOut() {
    current = null;
    persist(); emit();
  },
};

export function useAuth(): AuthUser | null {
  return useSyncExternalStore(
    (cb) => auth.subscribe(cb),
    () => auth.current(),
    () => auth.current(),
  );
}

export const DEMO_CREDENTIALS = [
  { role: "Admin", email: "admin@mptourism.in", password: "admin123" },
  { role: "Staff", email: "staff@mptourism.in", password: "staff123" },
];

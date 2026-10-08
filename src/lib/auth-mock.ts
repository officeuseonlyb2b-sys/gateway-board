<<<<<<< HEAD
// Supabase Auth identity; application authority comes only from Employee Master.
=======
// Tiny mock auth — replace with Supabase later. Two pre-seeded users.
// FIXED: Robust session persistence — never treat a momentary null as a logout.
>>>>>>> 32b9641 (okoo)
import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { listEmployees, replaceEmployeesFromCloud } from "@/lib/crm/store";
import type { Employee } from "@/lib/crm/types";

export type Role = "admin" | "staff";
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
}
<<<<<<< HEAD
export const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
let current: AuthUser | null = null;
let initialization: Promise<void> | undefined;
let generation = 0;
let signingIn = false;
=======

const KEY = "mp-tourism-auth-v1";

const SEED_USERS: Array<AuthUser & { password: string }> = [
  { id: "u_admin", email: "admin@mptourism.in", name: "Aarav Sharma", role: "admin", password: "admin123", avatarUrl: null },
  { id: "u_staff", email: "staff@mptourism.in", name: "Maya Iyer", role: "staff", password: "staff123", avatarUrl: null },
];

// Module-level state — survives React re-renders, only resets on hard page unload.
let _current: AuthUser | null = null;
let _initialized = false;
>>>>>>> 32b9641 (okoo)
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

<<<<<<< HEAD
async function validateUser(user: User | null) {
  const run = ++generation;
  if (!user) {
    current = null;
    replaceEmployeesFromCloud([]);
    emit();
    return;
  }
  const { data, error } = await supabase
    .from("crm_employees")
    .select("id,data")
    .eq("data->>auth_user_id", user.id);
  if (run !== generation) return;
  // A network/RLS refresh failure is not evidence that this browser's valid
  // Auth session is unlinked. Keep the resolved profile until a definitive
  // successful lookup says otherwise; focus/interval refresh will retry.
  if (error) return;
  const employee =
    data?.length === 1 ? { ...(data[0].data as unknown as Employee), id: data[0].id } : undefined;
  const records =
    current?.id === user.id && employee?.role === "Super Admin"
      ? [...listEmployees().filter((row) => row.auth_user_id !== user.id), employee]
      : employee
        ? [employee]
        : [];
  replaceEmployeesFromCloud(records);
  current = {
    id: user.id,
    email: user.email || "",
    name: employee?.name || "User",
    role: "staff",
    avatarUrl: null,
  };
  emit();
}

async function revalidate() {
  if (!hasSupabaseConfig || signingIn) return;
  const run = ++generation;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (run !== generation) return;
    await validateUser(error ? null : data.user);
  } catch {
    if (run === generation) await validateUser(null);
  }
}

function init() {
  if (initialization || typeof window === "undefined") return;
  if (!hasSupabaseConfig) {
    initialization = Promise.resolve();
    return;
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
      void validateUser(null);
      return;
    }
    // This browser client owns this session. Resolve the profile from the
    // event payload instead of issuing a competing Auth request in the event
    // lock, which can otherwise race token refreshes.
    if (event !== "INITIAL_SESSION" && !signingIn)
      setTimeout(() => void validateUser(session.user), 0);
  });
  initialization = revalidate();
  window.addEventListener("focus", () => void revalidate());
  window.setInterval(() => {
    if (current) void revalidate();
  }, 30_000);
=======
/**
 * Read and cache the session from localStorage exactly once per page lifecycle.
 * Subsequent calls return the cached value — no more "flash-null" on re-render.
 */
function load(): AuthUser | null {
  if (_initialized) return _current;
  _initialized = true;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthUser;
      // Basic sanity check before trusting persisted data.
      if (parsed && parsed.id && parsed.email && parsed.role) {
        _current = parsed;
      }
    }
  } catch {/* ignore parse errors */}
  return _current;
}

function persist() {
  if (typeof window === "undefined") return;
  if (_current) localStorage.setItem(KEY, JSON.stringify(_current));
  else localStorage.removeItem(KEY);
>>>>>>> 32b9641 (okoo)
}

export const auth = {
<<<<<<< HEAD
  current() {
    init();
    return current;
  },
  async ready() {
    init();
    await initialization;
    return current;
  },
  revalidate,
  subscribe(listener: () => void) {
    init();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async signIn(
    loginId: string,
    password: string,
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    init();
    if (!hasSupabaseConfig)
      return { ok: false, error: "Cloud authentication is not configured for this app." };
    try {
      await initialization;
      signingIn = true;
      generation++;
      const normalized = loginId.trim();
      if (normalized.includes("@")) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalized,
          password,
        });
        if (error || !data.user) throw new Error("Invalid admin email or password.");
        await validateUser(data.user);
        const employee = listEmployees().find((row) => row.auth_user_id === data.user.id);
        if (
          employee?.role !== "Super Admin" ||
          !employee.active ||
          employee.account_status !== "Active" ||
          employee.employee_status === "Exited"
        ) {
          await auth.signOut();
          throw new Error("Account not linked / Contact Administrator");
        }
      } else {
        const { data, error } = await supabase.functions.invoke("employee-login", {
          body: { loginId: normalized, password },
        });
        if (error || !data?.session) throw new Error("Invalid Employee ID or password.");
        const result = await supabase.auth.setSession(data.session);
        if (result.error || !result.data.user) throw new Error("Invalid Employee ID or password.");
        await validateUser(result.data.user);
      }
      if (!current) throw new Error("Account not linked / Contact Administrator");
      return { ok: true, user: current };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Sign in failed. Please try again.",
      };
    } finally {
      signingIn = false;
    }
  },
  async signOut() {
    await validateUser(null);
    // Explicitly scope logout to this browser's persisted session. Never use
    // the organisation-wide/global sign-out operation for a normal logout.
    if (hasSupabaseConfig) await supabase.auth.signOut({ scope: "local" });
=======
  /**
   * Returns the current user. On first call, hydrates from localStorage.
   * NEVER returns null transiently — only returns null when genuinely not logged in.
   */
  current(): AuthUser | null { return load(); },

  /**
   * Returns true ONLY when auth has been initialized from storage.
   * Use this to distinguish "loading" from "not logged in".
   */
  isInitialized(): boolean { return _initialized; },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async signIn(email: string, password: string): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    await new Promise((r) => setTimeout(r, 350));
    const u = SEED_USERS.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
    if (!u) return { ok: false, error: "Invalid email or password." };
    const { password: _pw, ...safe } = u;
    _current = safe;
    persist(); emit();
    return { ok: true, user: safe };
  },

  /**
   * Explicit sign-out. Called only by explicit user action or verified backend revocation.
   */
  signOut() {
    _current = null;
    persist(); emit();
>>>>>>> 32b9641 (okoo)
  },
};

/**
 * Hook: returns the authenticated user or null.
 * useSyncExternalStore guarantees the same snapshot across render + hydration.
 */
export function useAuth(): AuthUser | null {
  return useSyncExternalStore(auth.subscribe, auth.current, () => null);
}

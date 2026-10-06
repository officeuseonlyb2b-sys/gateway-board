// Supabase Auth identity; application authority comes only from Employee Master.
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
export const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
let current: AuthUser | null = null;
let initialization: Promise<void> | undefined;
let generation = 0;
let signingIn = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

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
  const employee =
    !error && data?.length === 1
      ? { ...(data[0].data as unknown as Employee), id: data[0].id }
      : undefined;
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
    // Do not await another Auth call inside the Auth event lock.
    if (event !== "INITIAL_SESSION" && !signingIn) setTimeout(() => void revalidate(), 0);
  });
  initialization = revalidate();
  window.addEventListener("focus", () => void revalidate());
  window.setInterval(() => {
    if (current) void revalidate();
  }, 30_000);
}

export const auth = {
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
    if (hasSupabaseConfig) await supabase.auth.signOut();
  },
};

export function useAuth(): AuthUser | null {
  return useSyncExternalStore(auth.subscribe, auth.current, () => null);
}

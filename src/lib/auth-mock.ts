// Auth backed by Lovable Cloud (real accounts, shared across devices).
// The module keeps its original API (auth.current/subscribe/signIn/signOut,
// useAuth) so every existing consumer keeps working unchanged.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "staff";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
}

let current: AuthUser | null = null;
let initialized = false;
const listeners = new Set<() => void>();
const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const localUser: AuthUser = {
  id: "local-admin",
  email: "admin@local.mptourism",
  name: "Local Admin",
  role: "admin",
};

function emit() {
  listeners.forEach((l) => l());
}

function toUser(u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): AuthUser | null {
  if (!u) return null;
  const email = u.email ?? "";
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    email.split("@")[0] ||
    "User";
  const role = (typeof meta.role === "string" && meta.role === "staff" ? "staff" : "admin") as Role;
  return { id: u.id, email, name, role, avatarUrl: null };
}

/**
 * Synchronously bootstrap from the persisted session so route guards
 * (which read auth.current() during beforeLoad) don't bounce to /login
 * before the async session check resolves.
 */
function bootstrapFromStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { user?: { id: string; email?: string; user_metadata?: Record<string, unknown> } };
      const u = toUser(parsed?.user);
      if (u) return u;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (!hasSupabaseConfig) {
    current = localUser;
    return;
  }
  current = bootstrapFromStorage();

  supabase.auth.onAuthStateChange((_event, session) => {
    current = toUser(session?.user ?? null);
    emit();
  });

  void supabase.auth.getSession().then(({ data }) => {
    current = toUser(data.session?.user ?? null);
    emit();
  });
}

export const auth = {
  current(): AuthUser | null {
    init();
    return current;
  },
  subscribe(fn: () => void) {
    init();
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async signIn(
    email: string,
    password: string,
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    init();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return { ok: false, error: error?.message ?? "Invalid email or password." };
    current = toUser(data.user);
    emit();
    return { ok: true, user: current! };
  },
  async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; error: string }> {
    init();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { full_name: fullName.trim() || email.split("@")[0], role: "admin" },
      },
    });
    if (error) return { ok: false, error: error.message };
    if (data.session) {
      current = toUser(data.user);
      emit();
      return { ok: true, needsConfirmation: false };
    }
    return { ok: true, needsConfirmation: true };
  },
  async signOut() {
    await supabase.auth.signOut();
    current = null;
    emit();
  },
};

export function useAuth(): AuthUser | null {
  return useSyncExternalStore(
    (cb) => auth.subscribe(cb),
    () => auth.current(),
    () => null,
  );
}

// Supabase Auth identity; application authority comes only from Employee Master.
import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Employee } from "@/lib/crm/types";

export type Role = "admin" | "staff";
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
}

export interface AuthLifecycle {
  initialized: boolean;
  sessionStatus: "loading" | "authenticated" | "signed_out";
  profileStatus: "idle" | "loading" | "ready" | "error" | "denied";
  profileError?: string;
  user: AuthUser | null;
  /** The one Employee Master row verified during auth bootstrap. */
  employee: Employee | null;
}

export const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

let lifecycle: AuthLifecycle = {
  initialized: false,
  sessionStatus: "loading",
  profileStatus: "idle",
  user: null,
  employee: null,
};
let initialization: Promise<void> | undefined;
let resolveInitialization: (() => void) | undefined;
let authUser: User | null = null;
let generation = 0;
let signingIn = false;
let explicitlyLoggedOut = false;
let signOutPromise: Promise<void> | undefined;
let authSubscription: { unsubscribe: () => void } | undefined;
let retryTimer: number | undefined;
let focusHandler: (() => void) | undefined;
let profileFlight: { userId: string; promise: Promise<ProfileResult> } | undefined;
let profileQueries = 0;
let duplicateAuthEventsIgnored = 0;
const bootStartedAt = typeof performance === "undefined" ? 0 : performance.now();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function updateLifecycle(patch: Partial<AuthLifecycle>) {
  lifecycle = { ...lifecycle, ...patch };
  emit();
}

function debugAuth(message: string) {
  if (import.meta.env.DEV) console.info(`[AUTH] ${message}`);
}

function bootTiming(label: string) {
  if (import.meta.env.DEV && typeof performance !== "undefined") {
    console.info(`[boot] ${label}: ${Math.round(performance.now() - bootStartedAt)}ms`);
  }
}

function publishEmployeeToCrmStore(employee: Employee | null) {
  // Keep the large CRM store (and its legacy localStorage caches) out of the
  // critical auth path. Modules that need it receive the verified employee on
  // the next idle turn.
  const publish = () => {
    void import("@/lib/crm/store").then((store) => {
      if ((employee?.auth_user_id ?? null) !== (lifecycle.employee?.auth_user_id ?? null)) return;
      store.replaceEmployeesFromCloud(employee ? [employee] : []);
      if (!employee) {
        store.replaceAssignmentCandidatesFromCloud([]);
        store.setAssignmentDirectoryStatus("idle");
      }
    });
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(publish, { timeout: 1_000 });
  } else if (typeof window !== "undefined") {
    window.setTimeout(publish, 0);
  }
}

function toAuthUser(user: User): AuthUser {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return {
    id: user.id,
    email: user.email || "",
    name: typeof metadataName === "string" && metadataName ? metadataName : "User",
    role: "staff",
    avatarUrl: null,
  };
}

function clearLocalIdentity(reason: string) {
  const hadIdentity = authUser !== null || lifecycle.user !== null;
  generation++;
  profileFlight = undefined;
  authUser = null;
  updateLifecycle({
    initialized: true,
    sessionStatus: "signed_out",
    profileStatus: "idle",
    profileError: undefined,
    user: null,
    employee: null,
  });
  if (hadIdentity) publishEmployeeToCrmStore(null);
  debugAuth(`session cleared reason=${reason}`);
  resolveInitialization?.();
  resolveInitialization = undefined;
}

function isEmployeeAllowed(employee: Employee): boolean {
  // Match the existing Employee Master access rule; do not infer status from a failed read.
  return (
    employee.auth_user_id !== undefined &&
    employee.active === true &&
    employee.account_status === "Active" &&
    employee.employee_status !== "Exited"
  );
}

type ProfileResult = "ready" | "error" | "denied" | "stale";

async function runEmployeeProfileResolution(user: User, source: string): Promise<ProfileResult> {
  const requestGeneration = generation;
  const requestUserId = user.id;
  if (authUser?.id !== requestUserId || lifecycle.user?.id !== requestUserId) {
    return "stale" as const;
  }

  profileQueries++;
  debugAuth(
    `profile resolution started user=${requestUserId} source=${source} query_count=${profileQueries}`,
  );
  try {
    const profileLookup = supabase
      .from("crm_employees")
      .select("id,data")
      .eq("data->>auth_user_id", requestUserId);
    const { data, error } = await Promise.race([
      profileLookup,
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Employee profile check timed out.")), 15_000);
      }),
    ]);

    if (requestGeneration !== generation || authUser?.id !== requestUserId) {
      debugAuth(`profile result ignored as stale user=${requestUserId}`);
      return "stale" as const;
    }
    if (error) {
      const errorCode = "code" in error && typeof error.code === "string" ? error.code : "unknown";
      debugAuth(
        `profile resolution failed user=${requestUserId} code=${errorCode}; keeping session`,
      );
      updateLifecycle({
        profileStatus: lifecycle.profileStatus === "ready" ? "ready" : "error",
        profileError:
          "Employee access details could not be refreshed. Your session is preserved; retry when connected.",
      });
      return "error" as const;
    }

    // A successful empty/ambiguous lookup is not proof that an account was disabled:
    // RLS can hide rows. Block application access, but preserve the session and cached profile.
    if (!data || data.length !== 1) {
      debugAuth(
        `profile resolution unavailable user=${requestUserId} matches=${data?.length ?? 0}`,
      );
      updateLifecycle({
        profileStatus: "error",
        profileError:
          "A unique linked Employee Master profile could not be verified. Retry the profile check.",
      });
      return "error" as const;
    }

    const employee = {
      ...(data[0].data as unknown as Employee),
      id: data[0].id,
    };
    if (!isEmployeeAllowed(employee)) {
      debugAuth(`employee access prohibited user=${requestUserId} reason=Employee Master status`);
      updateLifecycle({
        profileStatus: "denied",
        profileError: "This employee account is inactive, suspended, disabled, or exited.",
      });
      await signOutLocal("employee status explicitly prohibits access");
      return "denied" as const;
    }

    if (source === "explicit admin login" && employee.role !== "Super Admin") {
      debugAuth(
        `employee access prohibited user=${requestUserId} reason=Super Admin role required`,
      );
      updateLifecycle({
        profileStatus: "denied",
        profileError: "This login is not authorised for Super Admin access.",
      });
      await signOutLocal("admin email did not resolve to an active Super Admin");
      return "denied" as const;
    }

    updateLifecycle({
      user: { ...toAuthUser(user), name: employee.name || toAuthUser(user).name },
      employee,
      sessionStatus: "authenticated",
      profileStatus: "ready",
      profileError: undefined,
    });
    bootTiming("CRM profile resolved");
    bootTiming("auth ready");
    publishEmployeeToCrmStore(employee);
    debugAuth(`profile resolution succeeded user=${requestUserId} role=${employee.role}`);
    return "ready" as const;
  } catch (error) {
    if (requestGeneration !== generation || authUser?.id !== requestUserId) {
      debugAuth(`profile exception ignored as stale user=${requestUserId}`);
      return "stale" as const;
    }
    const errorCode =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "network_or_unknown";
    debugAuth(`profile resolution failed user=${requestUserId} code=${errorCode}; keeping session`);
    updateLifecycle({
      profileStatus: lifecycle.profileStatus === "ready" ? "ready" : "error",
      profileError:
        "Employee access details could not be refreshed. Your session is preserved; retry when connected.",
    });
    return "error" as const;
  }
}

function resolveEmployeeProfile(user: User, source: string): Promise<ProfileResult> {
  if (profileFlight?.userId === user.id) {
    duplicateAuthEventsIgnored++;
    debugAuth(
      `profile resolution reused user=${user.id} source=${source} duplicate_count=${duplicateAuthEventsIgnored}`,
    );
    return profileFlight.promise;
  }
  const promise = runEmployeeProfileResolution(user, source).finally(() => {
    if (profileFlight?.promise === promise) profileFlight = undefined;
  });
  profileFlight = { userId: user.id, promise };
  return promise;
}

function acceptSession(user: User, event: string) {
  if (explicitlyLoggedOut && event !== "SIGNED_IN" && !signingIn) {
    debugAuth(`ignored ${event} session restore after explicit logout user=${user.id}`);
    return;
  }
  if (event === "SIGNED_IN") explicitlyLoggedOut = false;

  const isSameUser = lifecycle.user?.id === user.id;
  const previousProfileStatus = lifecycle.profileStatus;
  if (!isSameUser) {
    generation++;
    profileFlight = undefined;
    publishEmployeeToCrmStore(null);
  }
  authUser = user;
  updateLifecycle({
    initialized: true,
    sessionStatus: "authenticated",
    profileStatus: isSameUser ? previousProfileStatus : "loading",
    profileError: isSameUser ? lifecycle.profileError : undefined,
    user: isSameUser ? { ...lifecycle.user!, email: user.email || "" } : toAuthUser(user),
    employee: isSameUser ? lifecycle.employee : null,
  });
  resolveInitialization?.();
  resolveInitialization = undefined;
  debugAuth(`${event} user=${user.id} session=true`);
  if (event === "INITIAL_SESSION") bootTiming("session resolved");

  // Never call another Supabase Auth method inside onAuthStateChange.
  const shouldResolveProfile =
    event === "USER_UPDATED" ||
    (!isSameUser && !signingIn) ||
    (event === "SIGNED_IN" && !signingIn && previousProfileStatus !== "ready");
  if (shouldResolveProfile) {
    setTimeout(() => void resolveEmployeeProfile(user, event), 0);
  } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
    duplicateAuthEventsIgnored++;
    debugAuth(
      `ignored duplicate ${event} bootstrap user=${user.id} duplicate_count=${duplicateAuthEventsIgnored}`,
    );
  }
}

function init() {
  if (initialization || typeof window === "undefined") return;
  initialization = new Promise<void>((resolve) => {
    resolveInitialization = resolve;
  });

  if (!hasSupabaseConfig) {
    updateLifecycle({
      initialized: true,
      sessionStatus: "signed_out",
      profileStatus: "idle",
      user: null,
      employee: null,
    });
    resolveInitialization?.();
    resolveInitialization = undefined;
    return;
  }

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    debugAuth(`${event} user=${session?.user.id ?? "none"} session=${Boolean(session)}`);
    if (event === "SIGNED_OUT") {
      clearLocalIdentity("Supabase SIGNED_OUT event");
      return;
    }
    if (event === "INITIAL_SESSION") {
      if (!session) {
        clearLocalIdentity("INITIAL_SESSION confirmed no persisted session");
        return;
      }
      acceptSession(session.user, event);
      return;
    }
    if (session) acceptSession(session.user, event);
  });
  authSubscription = data.subscription;

  focusHandler = () => void auth.revalidate();
  window.addEventListener("focus", focusHandler);
  retryTimer = window.setInterval(() => {
    if (authUser && (lifecycle.profileStatus !== "ready" || lifecycle.profileError)) {
      void auth.revalidate();
    }
  }, 30_000);
}

function disposeAuthLifecycle() {
  authSubscription?.unsubscribe();
  authSubscription = undefined;
  if (typeof window !== "undefined") {
    if (focusHandler) window.removeEventListener("focus", focusHandler);
    if (retryTimer) window.clearInterval(retryTimer);
  }
  focusHandler = undefined;
  retryTimer = undefined;
  resolveInitialization?.();
  resolveInitialization = undefined;
  initialization = undefined;
}

if (import.meta.hot) import.meta.hot.dispose(disposeAuthLifecycle);

async function signOutLocal(reason: string) {
  if (signOutPromise) return signOutPromise;
  explicitlyLoggedOut = true;
  debugAuth(`signOut called reason=${reason}`);
  clearLocalIdentity(reason);
  signOutPromise = (async () => {
    try {
      if (hasSupabaseConfig) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) debugAuth(`local signOut returned error code=${error.code || "unknown"}`);
      }
    } catch (error) {
      const errorCode =
        error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? error.code
          : "unknown";
      debugAuth(`local signOut failed code=${errorCode}`);
    } finally {
      signOutPromise = undefined;
    }
  })();
  return signOutPromise;
}

export const auth = {
  current() {
    init();
    return lifecycle.user;
  },
  lifecycle() {
    init();
    return lifecycle;
  },
  logRedirect(reason: string) {
    debugAuth(`redirect reason=${reason}`);
  },
  markShellRendered() {
    bootTiming("app shell rendered");
  },
  async ready() {
    init();
    await initialization;
    return lifecycle.user;
  },
  async revalidate() {
    init();
    if (initialization) await initialization;
    const user = authUser;
    if (!user || lifecycle.sessionStatus !== "authenticated") return;
    await resolveEmployeeProfile(user, "retry");
  },
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
    if (signOutPromise) await signOutPromise;
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
        acceptSession(data.user, "SIGNED_IN");
        const profileResult = await resolveEmployeeProfile(data.user, "explicit admin login");
        if (profileResult === "error") {
          return {
            ok: false,
            error: "Signed in, but Employee Master could not be verified. Retry the profile check.",
          };
        }
        if (profileResult === "denied") {
          throw new Error("Account not linked / Contact Administrator");
        }
      } else {
        const { data, error } = await supabase.functions.invoke("employee-login", {
          body: { loginId: normalized, password },
        });
        if (error || !data?.session) throw new Error("Invalid Employee ID or password.");
        const result = await supabase.auth.setSession(data.session);
        if (result.error || !result.data.user) throw new Error("Invalid Employee ID or password.");
        acceptSession(result.data.user, "SIGNED_IN");
        const profileResult = await resolveEmployeeProfile(
          result.data.user,
          "explicit employee login",
        );
        if (profileResult === "error") {
          return {
            ok: false,
            error: "Signed in, but Employee Master could not be verified. Retry the profile check.",
          };
        }
        if (profileResult === "denied") throw new Error("This employee account is not active.");
      }
      if (lifecycle.profileStatus !== "ready" || !lifecycle.user) {
        throw new Error("Account not linked / Contact Administrator");
      }
      return { ok: true, user: lifecycle.user };
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
    await signOutLocal("explicit logout requested by user");
  },
};

export function useAuth(): AuthUser | null {
  return useSyncExternalStore(auth.subscribe, auth.current, () => null);
}

export function useAuthLifecycle(): AuthLifecycle {
  return useSyncExternalStore(auth.subscribe, auth.lifecycle, auth.lifecycle);
}

import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "mp_tourism_notifications";
const PREF_KEY = "mp_tourism_notification_prefs";

export type NotifKind = "success" | "warning" | "info" | "error";
export type NotifCategory =
  | "quote_saved" | "draft_saved" | "rate_missing" | "import" | "export"
  | "hotel_added" | "rate_expiring" | "query_followup" | "system";

export interface Notification {
  id: string;
  kind: NotifKind;
  category: NotifCategory;
  title: string;
  message: string;
  href?: string;
  created_at: string;
  read: boolean;
  query_id?: string;
  task_id?: string;
  recipient_user_id?: string;
  recipient_name?: string;
  dedupe_key?: string;
}

export interface NotifPrefs {
  quote_saved: boolean;
  draft_saved: boolean;
  rate_missing: boolean;
  import: boolean;
  export: boolean;
  hotel_added: boolean;
  rate_expiring: boolean;
  query_followup: boolean;
  system: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  quote_saved: true, draft_saved: true, rate_missing: true, import: true,
  export: true, hotel_added: true, rate_expiring: true, query_followup: true, system: true,
};

const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();
let cache: Notification[] = [];
let inited = false;

function read(): Notification[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function refresh() { cache = read(); inited = true; }
function emit() { refresh(); listeners.forEach((l) => l()); }
function getSnapshot(): Notification[] { if (!inited) refresh(); return cache; }
function saveAll(list: Notification[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  emit();
}

export function getPrefs(): NotifPrefs {
  if (!isBrowser()) return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}
export function setPrefs(p: NotifPrefs) {
  if (!isBrowser()) return;
  localStorage.setItem(PREF_KEY, JSON.stringify(p));
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export function addNotification(n: Omit<Notification, "id" | "created_at" | "read">): void {
  if (!isBrowser()) return;
  const prefs = getPrefs();
  if (prefs[n.category] === false) return;
  const list = read();
  if (n.dedupe_key && list.some((item) => item.dedupe_key === n.dedupe_key && item.recipient_user_id === n.recipient_user_id)) return;
  const next = { ...n, id: uid(), created_at: new Date().toISOString(), read: false };
  list.unshift(next);
  saveAll(list);
  void supabase.from("crm_notifications").upsert(next, { onConflict: "id" });
}

export function markRead(id: string) {
  const list = read().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveAll(list);
  void supabase.from("crm_notifications").update({ read: true }).eq("id", id);
}
export function markAllRead() {
  saveAll(read().map((n) => ({ ...n, read: true })));
}
export function clearAll() { saveAll([]); }
export function deleteNotification(id: string) {
  saveAll(read().filter((n) => n.id !== id));
  void supabase.from("crm_notifications").delete().eq("id", id);
}

let notificationSyncStarted = false;
let notificationChannel: ReturnType<typeof supabase.channel> | null = null;
export function startNotificationSync() {
  if (notificationSyncStarted) return () => {};
  notificationSyncStarted = true;
  const pull = async () => {
    const { data, error } = await supabase.from("crm_notifications").select("*").order("created_at", { ascending: false }).limit(200);
    if (!error && data) saveAll(data as Notification[]);
  };
  void pull();
  notificationChannel = supabase.channel("crm-notifications").on(
    "postgres_changes", { event: "*", schema: "public", table: "crm_notifications" }, pull,
  ).subscribe();
  return () => {
    if (notificationChannel) void supabase.removeChannel(notificationChannel);
    notificationChannel = null;
    notificationSyncStarted = false;
  };
}

export function useNotifications(): Notification[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getSnapshot,
    () => [],
  );
}
export function useUnreadCount(): number {
  const list = useNotifications();
  return list.filter((n) => !n.read).length;
}

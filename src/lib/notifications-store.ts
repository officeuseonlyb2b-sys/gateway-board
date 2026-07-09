// Notifications persisted to localStorage.
import { useSyncExternalStore } from "react";

const KEY = "mp_tourism_notifications";
const PREF_KEY = "mp_tourism_notification_prefs";

export type NotifKind = "success" | "warning" | "info" | "error";
export type NotifCategory =
  | "quote_saved" | "draft_saved" | "rate_missing" | "import" | "export"
  | "hotel_added" | "rate_expiring" | "system";

export interface Notification {
  id: string;
  kind: NotifKind;
  category: NotifCategory;
  title: string;
  message: string;
  href?: string;
  created_at: string;
  read: boolean;
}

export interface NotifPrefs {
  quote_saved: boolean;
  draft_saved: boolean;
  rate_missing: boolean;
  import: boolean;
  export: boolean;
  hotel_added: boolean;
  rate_expiring: boolean;
  system: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  quote_saved: true, draft_saved: true, rate_missing: true, import: true,
  export: true, hotel_added: true, rate_expiring: true, system: true,
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
  list.unshift({ ...n, id: uid(), created_at: new Date().toISOString(), read: false });
  saveAll(list);
}

export function markRead(id: string) {
  const list = read().map((n) => (n.id === id ? { ...n, read: true } : n));
  saveAll(list);
}
export function markAllRead() {
  saveAll(read().map((n) => ({ ...n, read: true })));
}
export function clearAll() { saveAll([]); }
export function deleteNotification(id: string) {
  saveAll(read().filter((n) => n.id !== id));
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

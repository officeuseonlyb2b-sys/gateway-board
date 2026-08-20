import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, CheckCheck, Trash2, AlertTriangle, Info, CheckCircle2, XCircle, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  useNotifications, markRead, markAllRead, clearAll, deleteNotification,
  getPrefs, setPrefs, type Notification, type NotifPrefs, type NotifKind,
} from "@/lib/notifications-store";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — MP Tourism Hub" }] }),
  component: NotificationsPage,
});

const TABS: { key: "all" | "unread" | NotifKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "success", label: "Success" },
  { key: "warning", label: "Warnings" },
  { key: "info", label: "Info" },
];

const CATEGORY_LABELS: Record<keyof NotifPrefs, string> = {
  quote_saved: "Quote saved",
  draft_saved: "Draft auto-saved",
  rate_missing: "Rate not found",
  import: "Import success / errors",
  export: "Quote exported",
  hotel_added: "New hotel added",
  rate_expiring: "Rate plans expiring",
  query_followup: "Query follow-ups",
  system: "System messages",
};

function iconFor(kind: NotifKind) {
  const cls = "h-4 w-4";
  if (kind === "success") return <CheckCircle2 className={cn(cls, "text-emerald-600")} />;
  if (kind === "warning") return <AlertTriangle className={cn(cls, "text-amber-500")} />;
  if (kind === "error") return <XCircle className={cn(cls, "text-destructive")} />;
  return <Info className={cn(cls, "text-primary")} />;
}

function NotificationsPage() {
  const list = useNotifications();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [prefs, setPrefsState] = useState<NotifPrefs>(() => getPrefs());
  const [showPrefs, setShowPrefs] = useState(false);

  const filtered = useMemo(() => {
    if (tab === "all") return list;
    if (tab === "unread") return list.filter((n) => !n.read);
    return list.filter((n) => n.kind === tab);
  }, [list, tab]);

  function updatePref(k: keyof NotifPrefs, v: boolean) {
    const next = { ...prefs, [k]: v };
    setPrefsState(next);
    setPrefs(next);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">Everything that happened across your workspace.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPrefs((s) => !s)}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Preferences
          </Button>
          <Button size="sm" variant="outline" onClick={() => { markAllRead(); toast.success("All marked as read."); }} disabled={!list.some((n) => !n.read)}>
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark all read
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Clear all notifications?")) { clearAll(); toast.success("Cleared."); } }} disabled={!list.length}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear
          </Button>
        </div>
      </div>

      {showPrefs && (
        <Card className="p-4 mb-4">
          <div className="section-label mb-3">Notify me about</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(CATEGORY_LABELS) as (keyof NotifPrefs)[]).map((k) => (
              <div key={k} className="flex items-center justify-between p-2 rounded border">
                <Label htmlFor={`pref-${k}`} className="text-sm">{CATEGORY_LABELS[k]}</Label>
                <Switch id={`pref-${k}`} checked={prefs[k]} onCheckedChange={(v) => updatePref(k, !!v)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex gap-1 border-b mb-4">
        {TABS.map((t) => {
          const count = t.key === "all" ? list.length
            : t.key === "unread" ? list.filter((n) => !n.read).length
            : list.filter((n) => n.kind === t.key).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.key ? "border-accent text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}>
              {t.label} <span className="ml-1 text-xs text-muted-foreground">({count})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card className="py-16 text-center text-sm text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          Nothing here.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => <NotifRow key={n.id} n={n} />)}
        </div>
      )}
    </div>
  );
}

function NotifRow({ n }: { n: Notification }) {
  return (
    <Card className={cn("p-4 flex items-start gap-3 transition-colors", !n.read && "bg-accent/5 border-accent/30")}>
      <div className="mt-0.5">{iconFor(n.kind)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium text-sm">{n.title}</div>
          {!n.read && <Badge variant="secondary" className="text-[10px] h-4">New</Badge>}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">{n.message}</div>
        <div className="text-[11px] text-muted-foreground mt-1">
          {new Date(n.created_at).toLocaleString("en-IN")}
        </div>
      </div>
      <div className="flex gap-1">
        {!n.read && (
          <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>
        )}
        <Button size="icon" variant="ghost" onClick={() => deleteNotification(n.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </Card>
  );
}

import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useNotifications, markRead, markAllRead, type NotifKind,
} from "@/lib/notifications-store";

function iconFor(kind: NotifKind) {
  const cls = "h-4 w-4 shrink-0";
  if (kind === "success") return <CheckCircle2 className={cn(cls, "text-emerald-600")} />;
  if (kind === "warning") return <AlertTriangle className={cn(cls, "text-amber-500")} />;
  if (kind === "error") return <XCircle className={cn(cls, "text-destructive")} />;
  return <Info className={cn(cls, "text-primary")} />;
}

export function NotificationsDropdown() {
  const navigate = useNavigate();
  const list = useNotifications();
  const unread = list.filter((n) => !n.read).length;
  const preview = list.slice(0, 8);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
          <Bell className="h-[18px] w-[18px] text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          <button
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            onClick={() => markAllRead()}
            disabled={unread === 0}
          >
            <CheckCheck className="h-3 w-3" /> Mark all read
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {preview.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              You're all caught up.
            </div>
          ) : preview.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                markRead(n.id);
                if (n.query_id) navigate({ to: "/queries/$id", params: { id: n.query_id } });
                else if (n.href) window.location.assign(n.href);
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-muted/40 flex items-start gap-2.5",
                !n.read && "bg-accent/5",
              )}
            >
              {iconFor(n.kind)}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{n.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{n.message}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(n.created_at).toLocaleString("en-IN")}
                </div>
              </div>
              {!n.read && <span className="h-2 w-2 rounded-full bg-accent mt-1.5 shrink-0" />}
            </button>
          ))}
        </div>

        <div className="border-t px-3 py-2">
          <Link to="/notifications" className="block">
            <Button variant="ghost" size="sm" className="w-full">View all notifications</Button>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

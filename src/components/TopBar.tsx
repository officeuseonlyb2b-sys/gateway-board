import { Bell, Search, ChevronDown, LogOut, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { auth, useAuth } from "@/lib/auth-mock";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function TopBar() {
  const user = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const initials = user?.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?";

  return (
    <header className="h-16 bg-card border-b border-border flex items-center gap-4 px-6 shrink-0">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              navigate({ to: "/hotels", search: { q: q.trim() } as never });
            }
          }}
          placeholder="Search hotels, cities…"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted/60 border border-transparent focus:border-ring focus:bg-background focus:outline-none text-sm transition-colors"
        />
      </div>

      <button className="relative h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
        <Bell className="h-[18px] w-[18px] text-muted-foreground" />
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-gold" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 hover:bg-muted rounded-lg pl-1 pr-2 py-1 transition-colors">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-left hidden sm:block">
            <div className="text-sm font-medium leading-tight">{user?.name}</div>
            <div className="text-[11px] text-muted-foreground leading-tight capitalize">{user?.role}</div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs text-muted-foreground font-normal">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
            <User className="h-4 w-4 mr-2" /> Profile & Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { auth.signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

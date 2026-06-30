import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-mock";
import { db } from "@/lib/mock-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — MP Tourism Hub" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const user = useAuth();
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Profile, workspace and data management.</p>
      </div>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><div className="text-muted-foreground text-xs">Name</div><div>{user?.name}</div></div>
          <div><div className="text-muted-foreground text-xs">Email</div><div>{user?.email}</div></div>
          <div><div className="text-muted-foreground text-xs">Role</div><div className="capitalize">{user?.role}</div></div>
        </div>
        <p className="text-xs text-muted-foreground pt-2">Full profile editing and avatar upload will be enabled once Lovable Cloud is connected.</p>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">User Management</h2>
        <p className="text-sm text-muted-foreground">
          Invite-only signup: admins will be able to invite Staff/Editor users from this page once Cloud is enabled.
        </p>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Demo Data</h2>
        <p className="text-sm text-muted-foreground">
          The app is currently running on local mock data stored in your browser.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Reset all hotels, rooms and rate plans to the seeded demo data?")) {
              db.reset(); toast.success("Demo data reset.");
            }
          }}
        >
          Reset demo data
        </Button>
      </Card>
    </div>
  );
}

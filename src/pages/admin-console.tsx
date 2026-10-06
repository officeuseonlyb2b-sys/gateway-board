import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessProfile } from "@/lib/crm/access";

export default function AdminConsole() {
  const { employee } = useAccessProfile();
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold">Admin Console</h1>
        <p className="mt-2 text-muted-foreground">
          Welcome, {employee?.name}. All application modules are available in the sidebar.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Employees &amp; Login Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create employee identities and manage login access.
          </p>
          <Button asChild>
            <Link to="/team-access">Manage Employees</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

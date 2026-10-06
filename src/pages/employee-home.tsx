import { useAccessProfile } from "@/lib/crm/access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EmployeeHome() {
  const { employee } = useAccessProfile();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <h1 className="text-3xl font-bold">Welcome, {employee?.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Employee Home</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            Employee ID: <strong className="font-mono">{employee?.employee_code}</strong>
          </p>
          <p>Account Status: {employee?.account_status}</p>
          <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            Your system access is being configured by the administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

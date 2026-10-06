import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessProfile } from "@/lib/crm/access";
export default function ProfilePage() {
  const { employee } = useAccessProfile();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <h1 className="text-3xl font-bold">My Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>{employee?.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[
            ["Employee ID", employee?.employee_code],
            ["Phone", employee?.phone || "—"],
            ["Account Status", employee?.account_status],
            ["Employee Status", employee?.employee_status],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

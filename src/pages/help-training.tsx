import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessProfile } from "@/lib/crm/access";
export default function HelpTraining() {
  const { role } = useAccessProfile();
  if (role !== "Super Admin")
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
        <h1 className="text-3xl font-bold">Help &amp; Training</h1>
        <Card>
          <CardHeader>
            <CardTitle>Your employee account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Use your Employee ID and password to sign in. Your ID is shown on Home and My Profile.
            </p>
            <p>
              Contact the administrator for password resets or changes to your employee details.
            </p>
            <p>Your system access is being configured by the administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold">Help & Training</h1>
        <p className="text-sm text-slate-500">
          Role-based operating guidance for the MP Sales workflow.
        </p>
      </div>
      {[
        [
          "Start of day",
          "Open My Day, review overdue commitments, then work the Attention Centre in My Sales Desk.",
        ],
        [
          "Query lifecycle",
          "Create the Query first. The Sales Manager assigns ownership; the assigned executive works requirement, costing, quotation, follow-up and closure.",
        ],
        [
          "Quotation control",
          "Save unfinished work as a draft. Generated quotations are immutable; changes must be saved as a revised version.",
        ],
        [
          "Review & support",
          "Senior Sales Executives see only the Queries explicitly shared for review or assistance.",
        ],
        [
          "End of day",
          "Update every interaction, set the next action and due date, and close completed tasks.",
        ],
      ].map(([title, body]) => (
        <Card key={title}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">{body}</CardContent>
        </Card>
      ))}
    </div>
  );
}

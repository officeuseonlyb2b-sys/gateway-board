import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees } from "@/lib/crm/store";
import { refreshEmployees } from "@/lib/crm/crm-remote";
import { useAccessProfile } from "@/lib/crm/access";
import type { Employee } from "@/lib/crm/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Action =
  "create_employee" | "edit_employee" | "reset_password" | "set_status" | "delete_employee";
type Selection = { action: Action; employee?: Employee };
const APPROVED_ROLES = ["Sales Manager", "Senior Sales Executive", "Sales Executive"] as const;

export default function TeamAccess() {
  const employees = useEmployees();
  const access = useAccessProfile();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<(typeof APPROVED_ROLES)[number]>("Sales Executive");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void refreshEmployees()
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function open(action: Action, employee?: Employee) {
    setName(employee?.name || "");
    setPhone(employee?.phone || "");
    setRole(
      APPROVED_ROLES.includes(employee?.role as (typeof APPROVED_ROLES)[number])
        ? (employee!.role as (typeof APPROVED_ROLES)[number])
        : "Sales Executive",
    );
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setSelection({ action, employee });
  }
  function close() {
    if (busy) return;
    setSelection(null);
    setPassword("");
    setConfirm("");
    setShowPassword(false);
  }
  const needsPassword =
    selection?.action === "create_employee" || selection?.action === "reset_password";
  const editsIdentity =
    selection?.action === "create_employee" || selection?.action === "edit_employee";
  const target = selection?.employee;
  const enabling = target?.account_status !== "Active";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selection || busy) return;
    if (editsIdentity && !name.trim()) return void toast.error("Full name is required.");
    if (needsPassword && (password.length < 12 || password.length > 128))
      return void toast.error("Password must contain 12 to 128 characters.");
    if (needsPassword && password !== confirm) return void toast.error("Passwords do not match.");
    setBusy(true);
    const payload = {
      action: selection.action,
      employeeId: target?.id,
      ...(editsIdentity ? { name: name.trim(), phone: phone.trim(), role } : {}),
      ...(needsPassword ? { password } : {}),
      ...(selection.action === "set_status" ? { enabled: enabling } : {}),
    };
    setPassword("");
    setConfirm("");
    try {
      const { data, error } = await supabase.functions.invoke("manage-employee-account", {
        body: payload,
      });
      if (error) {
        let message = "Unable to update employee. Please try again.";
        if (error.context instanceof Response) {
          const detail = await error.context.json().catch(() => null);
          if (typeof detail?.error === "string") message = detail.error;
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      setSelection(null);
      if (selection.action === "create_employee") setCreatedCode(data.employeeCode);
      toast.success(
        selection.action === "reset_password"
          ? "Password reset successfully."
          : "Employee access updated.",
      );
      await refreshEmployees().catch(() =>
        toast.error("Saved. The employee list could not refresh; please reload it."),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Employee operation failed.");
      await refreshEmployees().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (!access.accountReady || access.role !== "Super Admin") return null;
  const regular = employees.filter((employee) => employee.role !== "Super Admin");
  const rows = [...employees].sort(
    (a, b) =>
      Number(b.role === "Super Admin") - Number(a.role === "Super Admin") ||
      (a.employee_code || "").localeCompare(b.employee_code || ""),
  );
  const active = regular.filter(
    (employee) => employee.active && employee.account_status === "Active",
  ).length;
  const title =
    selection?.action === "create_employee"
      ? "Add Employee"
      : selection?.action === "edit_employee"
        ? "Edit Employee"
        : selection?.action === "reset_password"
          ? "Reset Password"
          : selection?.action === "delete_employee"
            ? "Delete Employee"
            : enabling
              ? "Enable Login"
              : "Disable Login";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Employees &amp; Login Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create employee identities and manage login access.
          </p>
        </div>
        <Button onClick={() => open("create_employee")} disabled={busy || loading}>
          <Plus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Total Employees", regular.length],
          ["Active Logins", active],
          ["Disabled Logins", regular.length - active],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="w-full min-w-0">
        <CardContent className="w-full min-w-0 p-0">
          {loading ? (
            <p role="status" className="flex items-center justify-center gap-2 p-10">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading employees…
            </p>
          ) : loadError ? (
            <div role="alert" className="space-y-3 p-8 text-center">
              <p>Unable to load employees.</p>
              <Button
                variant="outline"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await refreshEmployees();
                    setLoadError(false);
                  } catch {
                    toast.error("Employee list is unavailable.");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="w-full min-w-0 max-w-full overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    {[
                      "Employee",
                      "Employee ID",
                      "Phone",
                      "Role",
                      "Login Status",
                      "Employee Status",
                      "Created On",
                      "Actions",
                    ].map((heading) => (
                      <th key={heading} className="whitespace-nowrap p-3 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((employee) => (
                    <tr key={employee.id} className="border-b last:border-0">
                      <td className="p-3">
                        <p className="font-semibold">{employee.name}</p>
                        {employee.role === "Super Admin" && (
                          <>
                            <p className="text-xs text-muted-foreground">{employee.email}</p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                              <ShieldCheck className="h-3 w-3" />
                              System Administrator
                            </p>
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3 font-mono">
                        {employee.employee_code || "Not assigned"}
                      </td>
                      <td className="p-3">{employee.phone || "—"}</td>
                      <td className="whitespace-nowrap p-3">{employee.role}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            employee.active && employee.account_status === "Active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {employee.account_status || "Unlinked"}
                        </Badge>
                      </td>
                      <td className="p-3">{employee.employee_status || "—"}</td>
                      <td className="whitespace-nowrap p-3">
                        {employee.joined_at
                          ? new Date(employee.joined_at).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td className="p-3">
                        {employee.role === "Super Admin" ? (
                          <span className="text-xs text-muted-foreground">Protected account</span>
                        ) : (
                          <div className="flex max-w-72 flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => open("edit_employee", employee)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy || !employee.auth_user_id}
                              onClick={() => open("reset_password", employee)}
                            >
                              Reset Password
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy || !employee.auth_user_id}
                              onClick={() => open("set_status", employee)}
                            >
                              {employee.account_status === "Active"
                                ? "Disable Login"
                                : "Enable Login"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={busy}
                              onClick={() => open("delete_employee", employee)}
                            >
                              Delete Employee
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!regular.length && (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  No employees have been created yet.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(selection)}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {target
                ? `${target.employee_code} — ${target.name}`
                : "Employee ID is generated automatically. Share the ID and initial password privately with the employee."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {editsIdentity && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="employee-name">Full Name *</Label>
                  <Input
                    id="employee-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-phone">Phone</Label>
                  <Input
                    id="employee-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={40}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-role">Role *</Label>
                  <select
                    id="employee-role"
                    value={role}
                    onChange={(event) =>
                      setRole(event.target.value as (typeof APPROVED_ROLES)[number])
                    }
                    disabled={busy}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {APPROVED_ROLES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {needsPassword && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="employee-password">
                    {selection?.action === "create_employee" ? "Initial Password" : "New Password"}{" "}
                    *
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="employee-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={12}
                      maxLength={128}
                      disabled={busy}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Use 12 to 128 characters.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-confirm">Confirm Password *</Label>
                  <Input
                    id="employee-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={12}
                    maxLength={128}
                    disabled={busy}
                  />
                </div>
              </>
            )}
            {selection?.action === "delete_employee" && (
              <p className="text-sm">
                Delete {target?.employee_code} - {target?.name}? Their login will be removed.
                Historical Queries, tasks and quotations will be preserved.
              </p>
            )}
            {selection?.action === "set_status" && (
              <p className="text-sm">
                {enabling
                  ? "Allow this employee to sign in again?"
                  : "Disable this employee’s login and application access?"}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={selection?.action === "delete_employee" ? "destructive" : "default"}
                disabled={busy}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selection?.action === "create_employee" ? "Create Employee" : title}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(createdCode)}
        onOpenChange={(value) => {
          if (!value) setCreatedCode(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Employee created successfully</DialogTitle>
            <DialogDescription>
              Employee ID: <strong className="font-mono text-foreground">{createdCode}</strong>
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The employee can sign in using this ID and the password you created.
          </p>
          <DialogFooter>
            <Button onClick={() => setCreatedCode(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

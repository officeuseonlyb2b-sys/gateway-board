import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { addEmployee, updateEmployee, useEmployees, type EmployeeInput } from "@/lib/crm/store";
import { useCrmMetrics } from "@/lib/crm/metrics";
import { StatCard } from "@/components/crm/ui";
import type { Employee } from "@/lib/crm/types";

const ROLES: Employee["role"][] = [
  "Sales Executive",
  "Assistant Manager",
  "Sales Manager",
  "Sales Head",
  "Operations Executive",
  "Unit Head",
  "Administrator",
  "Owner / Director",
  "Product Executive",
  "Contracting Executive",
  "Vendor Executive",
];

const blank: EmployeeInput = {
  name: "",
  role: "Sales Executive",
  email: "",
  phone: "",
  target_monthly: 0,
  active: true,
  department: "Sales",
  unit: "Madhya Pradesh",
  data_scope: "Own",
  designation: "Sales Executive",
  unit_scope: ["Madhya Pradesh"],
  employee_status: "Active",
  account_status: "Active",
  dashboard_template: "My Sales Desk",
};

export default function UsersRoles() {
  const employees = useEmployees();
  const metrics = useCrmMetrics();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeInput>(blank);

  const loadFor = (emp: Employee | null) => {
    setEditing(emp);
    setForm(
      emp
        ? {
            name: emp.name,
            role: emp.role,
            email: emp.email,
            phone: emp.phone ?? "",
            target_monthly: emp.target_monthly ?? 0,
            active: emp.active,
            department: emp.department ?? "Sales",
            unit: emp.unit ?? "Madhya Pradesh",
            data_scope: emp.data_scope ?? "Own",
            manager_id: emp.manager_id,
            designation: emp.designation ?? emp.role,
            unit_scope: emp.unit_scope ?? [emp.unit ?? "Madhya Pradesh"],
            permissions: emp.permissions ?? [],
            employee_code: emp.employee_code,
            employee_status: emp.employee_status ?? "Active",
            account_status: emp.account_status ?? "Active",
            dashboard_template: emp.dashboard_template ?? "My Sales Desk",
          }
        : blank,
    );
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (editing) {
      updateEmployee(editing.id, form);
      toast.success(`${form.name} updated`);
    } else {
      addEmployee(form);
      toast.success(`${form.name} added to the team`);
    }
    setOpen(false);
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    metrics.workload.forEach((w) => map.set(w.employee.name, w.assigned));
    return map;
  }, [metrics.workload]);

  const active = employees.filter((e) => e.active !== false).length;

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Users &amp; Roles
          </h1>
          <p className="text-sm text-muted-foreground">
            Employee register — everyone here becomes assignable across the CRM.
          </p>
        </div>
        <Button onClick={() => loadFor(null)}>
          <Plus className="h-4 w-4 mr-1" /> Add Employee
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Users className="h-5 w-5" />} label="Employees" value={employees.length} />
        <StatCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Active"
          value={active}
          tone="green"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Managers"
          value={employees.filter((e) => e.role === "Sales Manager").length}
          tone="purple"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Role</th>
                <th className="p-3">Email</th>
                <th className="p-3">Department / Unit</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Active Queries</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No employees yet. Add your first team member to start assigning leads.
                  </td>
                </tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3 font-medium">{e.name}</td>
                  <td className="p-3">
                    {e.role}
                    <br />
                    <span className="text-xs text-muted-foreground">{e.designation || e.role}</span>
                  </td>
                  <td className="p-3 text-muted-foreground">{e.email}</td>
                  <td className="p-3 text-muted-foreground">
                    {e.department || "Sales"}
                    <br />
                    <span className="text-xs">
                      {e.unit || "Madhya Pradesh"} · {e.data_scope || "Own"}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{e.phone || "—"}</td>
                  <td className="p-3">{counts.get(e.name) ?? 0}</td>
                  <td className="p-3">
                    <Badge variant={e.active === false ? "secondary" : "default"}>
                      {e.active === false ? "Inactive" : "Active"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateEmployee(e.id, { active: e.active === false })}
                      >
                        {e.active === false ? "Activate" : "Deactivate"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => loadFor(e)}
                        aria-label={`Edit ${e.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Exit ${e.name}`}
                        onClick={() => {
                          if ((counts.get(e.name) ?? 0) > 0) {
                            toast.error("Reassign this employee's active Queries before exit.");
                            return;
                          }
                          updateEmployee(e.id, {
                            active: false,
                            employee_status: "Exited",
                            account_status: "Disabled",
                          });
                          toast.success(`${e.name} marked Exited; history has been preserved.`);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
            <DialogDescription>
              Employees added here appear immediately in owner dropdowns and dashboards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(ev) => setForm({ ...form, name: ev.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Employee ID</Label>
              <Input value={form.employee_code || "Generated automatically"} disabled />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => {
                  const role = v as Employee["role"];
                  const department: Employee["department"] =
                    role === "Operations Executive"
                      ? "Operations"
                      : role === "Product Executive"
                        ? "Product"
                        : role === "Contracting Executive"
                          ? "Contracting"
                          : role === "Vendor Executive"
                            ? "Vendor Management"
                            : role === "Owner / Director"
                              ? "Management"
                              : role === "Administrator"
                                ? "Admin"
                                : "Sales";
                  const data_scope: Employee["data_scope"] =
                    role === "Sales Executive"
                      ? "Own"
                      : role === "Assistant Manager" || role === "Sales Manager"
                        ? "Team"
                        : role === "Sales Head"
                          ? "Department"
                          : role === "Owner / Director" || role === "Administrator"
                            ? "Organisation"
                            : role === "Unit Head" || role === "Operations Executive"
                              ? "Unit"
                              : "Own";
                  setForm({ ...form, role, department, data_scope });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Designation</Label>
              <Input
                value={form.designation || ""}
                onChange={(event) => setForm({ ...form, designation: event.target.value })}
                placeholder="Organisational title"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(ev) => setForm({ ...form, email: ev.target.value })}
                placeholder="name@company.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={form.department}
                  onValueChange={(value) =>
                    setForm({ ...form, department: value as Employee["department"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Sales",
                      "Operations",
                      "Product",
                      "Contracting",
                      "Vendor Management",
                      "Accounts",
                      "Marketing",
                      "Technology",
                      "Management",
                      "Admin",
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data scope</Label>
                <Select
                  value={form.data_scope}
                  onValueChange={(value) =>
                    setForm({ ...form, data_scope: value as Employee["data_scope"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Own", "Team", "Department", "Unit", "Organisation", "Custom"].map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input
                value={form.unit || ""}
                onChange={(event) =>
                  setForm({ ...form, unit: event.target.value, unit_scope: [event.target.value] })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Employee status</Label>
                <Select
                  value={form.employee_status || "Active"}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      employee_status: value as Employee["employee_status"],
                      active: value === "Active",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Active", "Inactive", "On Leave", "Exited"].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account status</Label>
                <Select
                  value={form.account_status || "Active"}
                  onValueChange={(value) =>
                    setForm({ ...form, account_status: value as Employee["account_status"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Active", "Suspended", "Disabled"].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Landing dashboard</Label>
              <Select
                value={form.dashboard_template || "My Sales Desk"}
                onValueChange={(value) =>
                  setForm({ ...form, dashboard_template: value as Employee["dashboard_template"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["My Sales Desk", "Sales Control Tower", "Operations Desk", "Admin Console"].map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reporting manager</Label>
              <Select
                value={form.manager_id || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, manager_id: value === "none" ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No reporting manager</SelectItem>
                  {employees
                    .filter((employee) => employee.id !== editing?.id)
                    .map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(ev) => setForm({ ...form, phone: ev.target.value })}
                placeholder="+91 ..."
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive employees can't receive new leads.
                </p>
              </div>
              <Switch
                checked={form.active !== false}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save changes" : "Add employee"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { addEmployee, removeEmployee, updateEmployee, useEmployees, type EmployeeInput } from "@/lib/crm/store";
import { useCrmMetrics } from "@/lib/crm/metrics";
import { StatCard } from "@/components/crm/ui";
import type { Employee } from "@/lib/crm/types";

const ROLES: Employee["role"][] = ["Sales Executive", "Sales Manager"];

const blank: EmployeeInput = { name: "", role: "Sales Executive", email: "", phone: "", target_monthly: 0, active: true };

export default function UsersRoles() {
  const employees = useEmployees();
  const metrics = useCrmMetrics();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeInput>(blank);

  const loadFor = (emp: Employee | null) => {
    setEditing(emp);
    setForm(emp
      ? { name: emp.name, role: emp.role, email: emp.email, phone: emp.phone ?? "", target_monthly: emp.target_monthly ?? 0, active: emp.active }
      : blank);
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.email.trim()) { toast.error("Email is required"); return; }
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> Users &amp; Roles</h1>
          <p className="text-sm text-muted-foreground">Employee register — everyone here becomes assignable across the CRM.</p>
        </div>
        <Button onClick={() => loadFor(null)}><Plus className="h-4 w-4 mr-1" /> Add Employee</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Users className="h-5 w-5" />} label="Employees" value={employees.length} />
        <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Active" value={active} tone="green" />
        <StatCard icon={<Users className="h-5 w-5" />} label="Managers" value={employees.filter((e) => e.role === "Sales Manager").length} tone="purple" />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Role</th>
                <th className="p-3">Email</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Active Queries</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No employees yet. Add your first team member to start assigning leads.</td></tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3 font-medium">{e.name}</td>
                  <td className="p-3">{e.role}</td>
                  <td className="p-3 text-muted-foreground">{e.email}</td>
                  <td className="p-3 text-muted-foreground">{e.phone || "—"}</td>
                  <td className="p-3">{counts.get(e.name) ?? 0}</td>
                  <td className="p-3">
                    <Badge variant={e.active === false ? "secondary" : "default"}>{e.active === false ? "Inactive" : "Active"}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => updateEmployee(e.id, { active: e.active === false })}>
                        {e.active === false ? "Activate" : "Deactivate"}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => loadFor(e)} aria-label={`Edit ${e.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${e.name}`}
                        onClick={() => { removeEmployee(e.id); toast.success(`${e.name} removed`); }}
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
            <DialogDescription>Employees added here appear immediately in owner dropdowns and dashboards.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Employee["role"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} placeholder="name@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} placeholder="+91 ..." />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Inactive employees can't receive new leads.</p>
              </div>
              <Switch checked={form.active !== false} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Add employee"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addTask, useEmployees } from "@/lib/crm/store";
import { useDB } from "@/lib/mock-store";
import { usePrograms } from "@/lib/wizard/agents-store";

export default function DataReadiness() {
  const data = useDB();
  const programs = usePrograms();
  const employees = useEmployees().filter((employee) => employee.active !== false);
  const [owner, setOwner] = useState("");
  const today = Date.now();
  const expired = data.rate_plans.filter(
    (rate) => new Date(rate.validity_end).getTime() < today,
  ).length;
  const expiring = data.rate_plans.filter((rate) => {
    const end = new Date(rate.validity_end).getTime();
    return end >= today && end <= today + 45 * 86400000;
  }).length;
  const checks = [
    { label: "MP cities", value: data.cities.length, healthy: data.cities.length > 0 },
    { label: "Hotels", value: data.hotels.length, healthy: data.hotels.length > 0 },
    {
      label: "Active/future rate plans",
      value: data.rate_plans.length - expired,
      healthy: data.rate_plans.length - expired > 0,
    },
    { label: "Programs & routings", value: programs.length, healthy: programs.length > 0 },
    {
      label: "Transport options",
      value: data.travel_options.length,
      healthy: data.travel_options.length > 0,
    },
    { label: "Guides", value: data.guides.length, healthy: data.guides.length > 0 },
    {
      label: "Entrance sites",
      value: data.entrance_sites.length,
      healthy: data.entrance_sites.length > 0,
    },
    { label: "Activities", value: data.activities.length, healthy: data.activities.length > 0 },
  ];
  const createGapTask = (title: string) => {
    if (!owner) return toast.error("Choose an owner for the rate-gap task.");
    addTask(
      {
        title,
        query_id: "",
        due_at: new Date(today + 86400000).toISOString(),
        owner,
        category: "Rate Gap",
        priority: "High",
        note: "Created from MP Data Readiness.",
      },
      "System",
    );
    toast.success("Rate-gap task created");
  };
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <div>
        <p className="text-sm font-medium text-teal-700">MP Unit · Costing support</p>
        <h1 className="text-3xl font-bold">Data Readiness</h1>
        <p className="text-sm text-slate-500">
          Visibility into the existing Product, Contracting and Vendor masters used by the preserved
          Costing engine.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => (
          <Card key={check.label}>
            <CardContent className="p-5">
              {check.healthy ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              <p className="mt-3 text-sm text-slate-500">{check.label}</p>
              <p className="mt-1 text-3xl font-bold">{check.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Rate coverage attention
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-slate-500">Expired rate plans</p>
            <p className="text-3xl font-bold text-red-600">{expired}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-slate-500">Expiring within 45 days</p>
            <p className="text-3xl font-bold text-amber-600">{expiring}</p>
          </div>
          <div className="md:col-span-2 flex flex-col gap-3 rounded-lg bg-slate-50 p-4 md:flex-row md:items-center">
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="md:w-72">
                <SelectValue placeholder="Assign gap task to…" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.name}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() =>
                createGapTask(`Resolve MP rate gaps (${expired} expired, ${expiring} expiring)`)
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Create common task
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

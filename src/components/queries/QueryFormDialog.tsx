// Add / edit dialog covering every Query Tracking field.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { addQuery, updateQuery } from "@/lib/queries/store";
import { derive } from "@/lib/queries/derive";
import { usePeriodRules } from "@/lib/queries/periods";
import {
  blankQuery, emptyFollowUp, CONVERSATION_MEDIUMS, FINAL_STATUSES, MARKET_SOURCES,
  PROGRAM_TYPES, QUERY_TYPES, SOURCE_TYPES,
  type FinalLeadStatus, type MarketSource, type QueryInput, type QueryRecord,
} from "@/lib/queries/types";

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Section({ title, children, cols = 3 }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</div>
      <div className={cn("grid gap-3", cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>{children}</div>
    </div>
  );
}

export function QueryFormDialog({
  open, onOpenChange, record,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record?: QueryRecord | null;
}) {
  const rules = usePeriodRules();
  const [form, setForm] = useState<QueryInput>(() => blankQuery());

  useEffect(() => {
    if (!open) return;
    if (record) {
      const { id: _i, serial: _s, query_no: _q, created_at: _c, updated_at: _u, ...rest } = record;
      const fus = [...(rest.follow_ups || [])];
      while (fus.length < 6) fus.push(emptyFollowUp());
      setForm({ ...rest, follow_ups: fus });
    } else {
      setForm(blankQuery());
    }
  }, [open, record]);

  const set = <K extends keyof QueryInput>(k: K, v: QueryInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setFU = (i: number, patch: Partial<QueryInput["follow_ups"][number]>) =>
    setForm((f) => ({ ...f, follow_ups: f.follow_ups.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const d = derive({ ...(form as unknown as QueryRecord) }, rules);

  function save() {
    if (!form.contact_person && !form.query_source_name) {
      toast.error("Enter a contact person or source name.");
      return;
    }
    if (record) {
      updateQuery(record.id, form);
      toast.success(`Query ${record.query_no} updated.`);
    } else {
      const rec = addQuery(form);
      toast.success(`Query ${rec.query_no} created.`);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? `Edit Query — ${record.query_no}` : "Add Query"}</DialogTitle>
          <DialogDescription>
            All QTS fields. Grey boxes are auto-calculated from the dates and pax you enter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section title="Query / Lead Information">
            <Field label="Query Date">
              <Input type="date" value={form.query_date} onChange={(e) => set("query_date", e.target.value)} />
            </Field>
            <Field label="Query Day (auto)">
              <Input value={d.query_day} readOnly className="bg-muted" />
            </Field>
            <Field label="Query Month (auto)">
              <Input value={d.query_month} readOnly className="bg-muted" />
            </Field>
            <Field label="Market Source">
              <select className={inputCls} value={form.query_market_source}
                onChange={(e) => set("query_market_source", e.target.value as MarketSource)}>
                {MARKET_SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Market Region">
              <Input value={form.query_market_region} onChange={(e) => set("query_market_region", e.target.value)} />
            </Field>
            <Field label="Query Type">
              <select className={inputCls} value={form.query_type} onChange={(e) => set("query_type", e.target.value)}>
                {QUERY_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Query For">
              <Input value={form.query_for} onChange={(e) => set("query_for", e.target.value)} />
            </Field>
            <Field label="Query Base City">
              <Input value={form.query_base_city} onChange={(e) => set("query_base_city", e.target.value)} />
            </Field>
            <Field label="Source Type">
              <select className={inputCls} value={form.query_source_type} onChange={(e) => set("query_source_type", e.target.value)}>
                {SOURCE_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Source Name">
              <Input value={form.query_source_name} onChange={(e) => set("query_source_name", e.target.value)} />
            </Field>
            <Field label="Contact Person">
              <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
            </Field>
            <Field label="Contact Number">
              <Input value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} />
            </Field>
            <Field label="Email ID">
              <Input type="email" value={form.email_id} onChange={(e) => set("email_id", e.target.value)} />
            </Field>
            <Field label="Travel Advisor">
              <Input value={form.travel_advisor} onChange={(e) => set("travel_advisor", e.target.value)} />
            </Field>
            <Field label="Conversation Medium">
              <select className={inputCls} value={form.conversation_medium} onChange={(e) => set("conversation_medium", e.target.value)}>
                {CONVERSATION_MEDIUMS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </Section>

          <Section title="Package Details">
            <Field label="Tour Starting Date">
              <Input type="date" value={form.tour_starting_date} onChange={(e) => set("tour_starting_date", e.target.value)} />
            </Field>
            <Field label="Tour Starting Day (auto)">
              <Input value={d.tour_starting_day} readOnly className="bg-muted" />
            </Field>
            <Field label="Tour Ending Date">
              <Input type="date" value={form.tour_ending_date} onChange={(e) => set("tour_ending_date", e.target.value)} />
            </Field>
            <Field label="Tour Ending Day (auto)">
              <Input value={d.tour_ending_day} readOnly className="bg-muted" />
            </Field>
            <Field label="Tour Duration (auto)">
              <Input value={d.tour_duration} readOnly className="bg-muted" />
            </Field>
            <Field label="Travel Month (auto)">
              <Input value={d.travel_month} readOnly className="bg-muted" />
            </Field>
            <Field label="Travel Period Marked As (auto)">
              <Input value={d.travel_period} readOnly className="bg-muted" />
            </Field>
            <Field label="No. of Pax">
              <Input type="number" min={1} value={form.no_of_pax}
                onChange={(e) => set("no_of_pax", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Per Person Cost">
              <Input type="number" min={0} value={form.per_person_cost}
                onChange={(e) => set("per_person_cost", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Total Query Amount (auto — override optional)">
              <Input type="number" placeholder={String(d.total_amount)}
                value={form.total_query_amount ?? ""}
                onChange={(e) => set("total_query_amount", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
            <Field label="Tour Starting City">
              <Input value={form.tour_starting_city} onChange={(e) => set("tour_starting_city", e.target.value)} />
            </Field>
            <Field label="Tour Ending City">
              <Input value={form.tour_ending_city} onChange={(e) => set("tour_ending_city", e.target.value)} />
            </Field>
            <Field label="Hotel Category">
              <Input value={form.hotel_category} onChange={(e) => set("hotel_category", e.target.value)} />
            </Field>
            <Field label="Interested Program Routing">
              <Input value={form.interested_program_routing} onChange={(e) => set("interested_program_routing", e.target.value)} />
            </Field>
            <Field label="Program Code">
              <Input value={form.interested_program_code} onChange={(e) => set("interested_program_code", e.target.value)} />
            </Field>
            <Field label="Program Name">
              <Input value={form.interested_program_name} onChange={(e) => set("interested_program_name", e.target.value)} />
            </Field>
            <Field label="Program Type">
              <select className={inputCls} value={form.program_type} onChange={(e) => set("program_type", e.target.value)}>
                <option value="">—</option>
                {PROGRAM_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Program Region">
              <Input value={form.program_region} onChange={(e) => set("program_region", e.target.value)} />
            </Field>
          </Section>

          <Section title="Query Working Status" cols={3}>
            {([["status_new", "New"], ["status_working", "Working"], ["status_nurturing", "Nurturing"]] as const).map(
              ([k, label]) => (
                <div key={k} className="flex items-center justify-between rounded border p-2.5">
                  <Label htmlFor={k} className="text-sm">{label}</Label>
                  <Switch id={k} checked={form[k]} onCheckedChange={(v) => set(k, !!v)} />
                </div>
              ),
            )}
          </Section>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              Follow-Up Phase 1 (1st – 3rd)
            </div>
            {[0, 1, 2].map((i) => <FollowUpRow key={i} i={i} fu={form.follow_ups[i]} setFU={setFU} />)}
            <div className="text-xs font-semibold uppercase tracking-wide text-primary pt-2">
              Follow-Up Phase 2 (4th – 6th)
            </div>
            {[3, 4, 5].map((i) => <FollowUpRow key={i} i={i} fu={form.follow_ups[i]} setFU={setFU} />)}
          </div>

          <Section title="Final Lead Status" cols={2}>
            <Field label="Final Lead Status">
              <select className={inputCls} value={form.final_status}
                onChange={(e) => set("final_status", e.target.value as FinalLeadStatus)}>
                {FINAL_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Remarks / Reason">
              <Textarea rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </Field>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{record ? "Save Changes" : "Create Query"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpRow({
  i, fu, setFU,
}: {
  i: number;
  fu: QueryInput["follow_ups"][number];
  setFU: (i: number, patch: Partial<QueryInput["follow_ups"][number]>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[110px_1fr_1fr_2fr_auto] items-end rounded border p-2.5">
      <div className="text-sm font-medium">#{i + 1}</div>
      <Field label="Date">
        <Input type="date" value={fu?.date || ""} onChange={(e) => setFU(i, { date: e.target.value })} />
      </Field>
      <Field label="Reminder">
        <Input type="datetime-local" value={fu?.reminder_at || ""}
          onChange={(e) => setFU(i, { reminder_at: e.target.value, notified: false })} />
      </Field>
      <Field label="Note">
        <Input value={fu?.note || ""} onChange={(e) => setFU(i, { note: e.target.value })} />
      </Field>
      <div className="flex items-center gap-2 pb-1.5">
        <Switch id={`fu-done-${i}`} checked={!!fu?.done} onCheckedChange={(v) => setFU(i, { done: !!v })} />
        <Label htmlFor={`fu-done-${i}`} className="text-xs text-muted-foreground">Done</Label>
      </div>
    </div>
  );
}

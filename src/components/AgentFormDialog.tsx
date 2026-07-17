import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addAgent, updateAgent, findDuplicateAgent, type Agent, type AgentStatus,
} from "@/lib/wizard/agents-store";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent?: Agent | null;
  onSaved?: (a: Agent) => void;
}

const emptyForm: Omit<Agent, "id" | "created_at" | "updated_at"> = {
  name: "", agency: "", contact_person: "", phone: "", alt_phone: "", email: "",
  website: "", address_line1: "", address_line2: "", city: "", state: "", country: "India", pincode: "",
  gst_number: "", pan_number: "", iata: "", agency_type: "", preferred_currency: "INR",
  credit_limit: undefined, payment_terms: "", whatsapp: "", notes: "", internal_remarks: "",
  status: "Active",
};

export function AgentFormDialog({ open, onOpenChange, agent, onSaved }: Props) {
  const [f, setF] = useState({ ...emptyForm });

  useEffect(() => {
    if (open) {
      if (agent) {
        setF({ ...emptyForm, ...agent });
      } else {
        setF({ ...emptyForm });
      }
    }
  }, [open, agent]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (!f.name.trim()) { toast.error("Agent name is required"); return; }
    if (!f.agency.trim()) { toast.error("Agency name is required"); return; }
    if (!f.phone.trim() && !f.email.trim()) { toast.error("Enter phone or email"); return; }
    const dup = findDuplicateAgent({ email: f.email, phone: f.phone }, agent?.id);
    if (dup) { toast.error(`Duplicate: ${dup.name} — ${dup.agency}`); return; }
    const saved = agent ? updateAgent(agent.id, f) : addAgent(f);
    if (!saved) { toast.error("Could not save agent"); return; }
    toast.success(agent ? "Agent updated" : "Agent added");
    onSaved?.(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent ? "Edit Agent" : "Add New Agent"}</DialogTitle>
          <DialogDescription>Master record used across quotations.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Basic Information</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Agent Name *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
              <div><Label>Agency Name *</Label><Input value={f.agency} onChange={(e) => set("agency", e.target.value)} /></div>
              <div><Label>Contact Person</Label><Input value={f.contact_person || ""} onChange={(e) => set("contact_person", e.target.value)} /></div>
              <div><Label>Mobile Number</Label><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div><Label>Alternate Mobile</Label><Input value={f.alt_phone || ""} onChange={(e) => set("alt_phone", e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div className="col-span-2"><Label>Website</Label><Input value={f.website || ""} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Address</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Address Line 1</Label><Input value={f.address_line1 || ""} onChange={(e) => set("address_line1", e.target.value)} /></div>
              <div className="col-span-2"><Label>Address Line 2</Label><Input value={f.address_line2 || ""} onChange={(e) => set("address_line2", e.target.value)} /></div>
              <div><Label>City</Label><Input value={f.city || ""} onChange={(e) => set("city", e.target.value)} /></div>
              <div><Label>State</Label><Input value={f.state || ""} onChange={(e) => set("state", e.target.value)} /></div>
              <div><Label>Country</Label><Input value={f.country || ""} onChange={(e) => set("country", e.target.value)} /></div>
              <div><Label>Pincode</Label><Input value={f.pincode || ""} onChange={(e) => set("pincode", e.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Business Information</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>GST Number</Label><Input value={f.gst_number || ""} onChange={(e) => set("gst_number", e.target.value.toUpperCase())} /></div>
              <div><Label>PAN Number</Label><Input value={f.pan_number || ""} onChange={(e) => set("pan_number", e.target.value.toUpperCase())} /></div>
              <div><Label>IATA</Label><Input value={f.iata || ""} onChange={(e) => set("iata", e.target.value)} /></div>
              <div>
                <Label>Agency Type</Label>
                <Select value={f.agency_type || ""} onValueChange={(v) => set("agency_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="B2B">B2B</SelectItem>
                    <SelectItem value="B2C">B2C</SelectItem>
                    <SelectItem value="Corporate">Corporate</SelectItem>
                    <SelectItem value="DMC">DMC</SelectItem>
                    <SelectItem value="OTA">OTA</SelectItem>
                    <SelectItem value="Wholesaler">Wholesaler</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Preferred Currency</Label>
                <Select value={f.preferred_currency || "INR"} onValueChange={(v) => set("preferred_currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["INR", "USD", "EUR", "GBP", "AED", "AUD", "SGD"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Credit Limit</Label>
                <Input type="number" value={f.credit_limit ?? ""} onChange={(e) => set("credit_limit", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div className="col-span-2"><Label>Payment Terms</Label><Input value={f.payment_terms || ""} onChange={(e) => set("payment_terms", e.target.value)} placeholder="e.g. 50% advance, 50% on arrival" /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Communication & Notes</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>WhatsApp Number</Label><Input value={f.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} /></div>
              <div>
                <Label>Status</Label>
                <Select value={f.status || "Active"} onValueChange={(v) => set("status", v as AgentStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
              <div className="col-span-2"><Label>Internal Remarks</Label><Textarea rows={2} value={f.internal_remarks || ""} onChange={(e) => set("internal_remarks", e.target.value)} /></div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{agent ? "Save Changes" : "Add Agent"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

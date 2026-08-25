import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLead, PARTNERS, useEmployees } from "@/lib/crm/store";
import { DESTINATIONS, ENQUIRY_TYPES, LEAD_SOURCES, MARKETS, PRIORITIES } from "@/lib/crm/types";
import { toast } from "sonner";

export default function NewLead() {
  const navigate = useNavigate();
  const employees = useEmployees();
  const roster = employees.filter((e) => e.active !== false);

  const [leadSource, setLeadSource] = useState(LEAD_SOURCES[0]);
  const [sourcePartner, setSourcePartner] = useState(PARTNERS[0]);
  const [contactPerson, setContactPerson] = useState("");
  const [market, setMarket] = useState(MARKETS[0]);
  const [destination, setDestination] = useState(DESTINATIONS[0]);
  const [enquiryType, setEnquiryType] = useState(ENQUIRY_TYPES[0]);
  const [travelStart, setTravelStart] = useState("");
  const [travelEnd, setTravelEnd] = useState("");
  const [numTravellers, setNumTravellers] = useState("4");
  const [priority, setPriority] = useState("Normal");
  const [owner, setOwner] = useState(roster[0]?.name ?? "");
  const [remarks, setRemarks] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const assignee = owner || roster[0]?.name;
    if (!assignee) {
      toast.error("Add an employee in Users & Roles before creating a lead.");
      return;
    }
    const { query } = createLead({
      lead_source: leadSource,
      customer: sourcePartner,
      contact_person: contactPerson || "—",
      market,
      enquiry_type: enquiryType,
      travel_start: travelStart,
      travel_end: travelEnd || travelStart,
      pax: parseInt(numTravellers, 10) || 1,
      destination,
      priority,
      requirement: remarks,
      owner: assignee,
    });
    toast.success(`${query.query_id} created and assigned to ${assignee}`);
    navigate({ to: "/query-tracker" });
  };

  const handleClear = () => {
    setContactPerson("");
    setTravelStart("");
    setTravelEnd("");
    setNumTravellers("");
    setPriority("Normal");
    setRemarks("");
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create New Lead</h1>
        <p className="text-sm text-muted-foreground">Capture new lead &amp; basic details to generate a query</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">Lead Source <span className="text-red-500">*</span></Label>
                <Select value={leadSource} onValueChange={setLeadSource}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Source Partner <span className="text-red-500">*</span></Label>
                <Select value={sourcePartner} onValueChange={setSourcePartner}>
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    {PARTNERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Contact Person <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Enter contact person name"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Market <span className="text-red-500">*</span></Label>
                <Select value={market} onValueChange={setMarket}>
                  <SelectTrigger><SelectValue placeholder="Select market" /></SelectTrigger>
                  <SelectContent>
                    {MARKETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Destination / State <span className="text-red-500">*</span></Label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>
                    {DESTINATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Enquiry Type <span className="text-red-500">*</span></Label>
                <Select value={enquiryType} onValueChange={setEnquiryType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ENQUIRY_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Travel Start <span className="text-red-500">*</span></Label>
                <Input type="date" value={travelStart} onChange={(e) => setTravelStart(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label>Travel End</Label>
                <Input type="date" value={travelEnd} onChange={(e) => setTravelEnd(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">No. of Travellers <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  placeholder="Enter number of travellers"
                  value={numTravellers}
                  onChange={(e) => setNumTravellers(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Priority <span className="text-red-500">*</span></Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Assign To <span className="text-red-500">*</span></Label>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {roster.map((e) => (
                      <SelectItem key={e.id} value={e.name}>{e.name} — {e.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Initial Requirement / Remarks</Label>
                <Textarea
                  placeholder="Enter initial requirements..."
                  rows={4}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleClear}>
                Clear
              </Button>
              <Button type="submit">
                Generate Lead &amp; Query →
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

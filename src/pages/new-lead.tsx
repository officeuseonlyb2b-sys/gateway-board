import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeadStore } from "@/lib/leads-store";

export default function NewLead() {
  const navigate = useNavigate();
  const addLead = useLeadStore((state) => state.addLead);

  // Form state
  const [leadSource, setLeadSource] = useState("website");
  const [sourcePartner, setSourcePartner] = useState("abc");
  const [contactPerson, setContactPerson] = useState("Amit Sharma");
  const [market, setMarket] = useState("domestic");
  const [destination, setDestination] = useState("mp");
  const [enquiryType, setEnquiryType] = useState("family");
  const [travelDates, setTravelDates] = useState("2026-09-12");
  const [numTravellers, setNumTravellers] = useState("4");
  const [priority, setPriority] = useState("normal");
  const [remarks, setRemarks] = useState(
    "5 Nights / 6 Days tour. 4* hotels preferred. Innova Crysta vehicle. Guides with Hindi & English. Entrance fees & activities required."
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build lead data object
    const leadData = {
      leadSource,
      sourcePartner: sourcePartner === "abc" ? "ABC Travels" : sourcePartner,
      contactPerson,
      market: market === "domestic" ? "Domestic - India" : "Inbound - International",
      destination: destination === "mp" ? "Madhya Pradesh" : destination,
      enquiryType: enquiryType === "family" ? "Family Tour" : enquiryType,
      travelDates,
      numTravellers: parseInt(numTravellers, 10),
      priority,
      remarks,
    };

    // Add to store
    addLead(leadData);

    // Navigate to query tracker
    navigate({ to: "/query-tracker" });
  };

  const handleClear = () => {
    setLeadSource("website");
    setSourcePartner("abc");
    setContactPerson("");
    setMarket("domestic");
    setDestination("mp");
    setEnquiryType("family");
    setTravelDates("");
    setNumTravellers("");
    setPriority("normal");
    setRemarks("");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create New Lead</h1>
        <p className="text-sm text-muted-foreground">Capture new lead & basic details to generate a query</p>
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
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                    <SelectItem value="walkin">Walk-in</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Source Partner <span className="text-red-500">*</span></Label>
                <Select value={sourcePartner} onValueChange={setSourcePartner}>
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="abc">ABC Travels</SelectItem>
                    <SelectItem value="globe">Globe Tours</SelectItem>
                    <SelectItem value="india">India Routes</SelectItem>
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
                    <SelectItem value="domestic">Domestic - India</SelectItem>
                    <SelectItem value="inbound">Inbound - International</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Destination / State <span className="text-red-500">*</span></Label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp">Madhya Pradesh</SelectItem>
                    <SelectItem value="rajasthan">Rajasthan</SelectItem>
                    <SelectItem value="gujarat">Gujarat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Enquiry Type <span className="text-red-500">*</span></Label>
                <Select value={enquiryType} onValueChange={setEnquiryType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="family">Family Tour</SelectItem>
                    <SelectItem value="group">Group Tour</SelectItem>
                    <SelectItem value="pilgrimage">Pilgrimage</SelectItem>
                    <SelectItem value="honeymoon">Honeymoon</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">Travel Dates <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={travelDates}
                  onChange={(e) => setTravelDates(e.target.value)}
                />
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
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
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
                Generate Lead & Query →
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
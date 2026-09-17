import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createLead } from "@/lib/crm/store";
import { pushCrmSnapshotNow } from "@/lib/crm/crm-remote";
import { useAuth } from "@/lib/auth-mock";
import { useAgents, usePrograms } from "@/lib/wizard/agents-store";
import { addClient, useClients } from "@/lib/crm/clients-store";

// Exact data extracted from screenshots
const LEAD_SOURCES = ["B2B", "B2C", "B2B2B"];

const MARKETS = [
  "Domestic - North",
  "Domestic - South",
  "Domestic - West",
  "Domestic - East",
  "Inbound - French",
  "Inbound - Spanish",
  "Inbound - German",
  "Inbound - USA",
  "Inbound - UK",
  "Inbound - Middle East",
  "Inbound - Far East",
  "Inbound - Asia Pacific",
  "Inbound - Russia",
];

const QUERY_TYPES = [
  "Regular Tour Package - FIT",
  "Regular Tour Package - GIT",
  "Women's Exclusive",
  "Senior Citizen Exclusive",
  "School Group",
  "College Group",
  "Business Travel",
  "MICE",
  "SIC - Departure",
  "Fixed Group Departure",
  "Group Join-In",
  "Kitchen Group",
  "Customized",
];

const QUERY_FORS = [
  "Package",
  "Hotels Only",
  "Transport Only",
  "Assistance Only",
  "Guides Only",
  "Hotels + Guides",
  "Hotels + Assistance",
  "Hotels + Guides + Assistance",
  "Transport + Guides",
  "Transport + Assistance",
  "Transport + Guides + Assistance",
  "Activities",
  "Other Services",
  "Hotels + Guides + Transport",
];

const SOURCE_TYPES = ["Partner", "Direct", "Agent"];
const CONVERSATION_MEDIUMS = ["Email", "WhatsApp"];

const COSTING_BASIS = [
  "FIT",
  "GIT",
  "Fixed Group Departure",
  "Group Join-In",
  "SIC Departure",
  "Customised / Component",
];

const HOTEL_CATEGORIES = [
  "Budget",
  "Excellent Budget",
  "3 Star",
  "3 Star Deluxe",
  "4 Star",
  "4 Star Superior",
  "5 Star",
  "5 Star Deluxe",
  "Luxury / Experiential",
  "Homestays",
];

export default function NewQuery() {
  const navigate = useNavigate();
  const user = useAuth();
  const agents = useAgents();
  const clients = useClients();
  const programmes = usePrograms();

  // Lead Information State
  const [marketSource, setMarketSource] = useState("");
  const [marketRegion, setMarketRegion] = useState("");
  const [queryType, setQueryType] = useState("");
  const [queryFor, setQueryFor] = useState("");
  const [queryBaseCity, setQueryBaseCity] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [sourcePartner, setSourcePartner] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [emailId, setEmailId] = useState("");
  const [conversationMedium, setConversationMedium] = useState("");

  // Travel & Commercial State
  const [tourStartDate, setTourStartDate] = useState("");
  const [tourEndDate, setTourEndDate] = useState("");
  const [costingBasis, setCostingBasis] = useState("");
  const [tourStartCity, setTourStartCity] = useState("");
  const [tourEndCity, setTourEndCity] = useState("");

  // Costing Range State
  const [minPax, setMinPax] = useState("");
  const [maxPax, setMaxPax] = useState("");
  const [hotelFrom, setHotelFrom] = useState("");
  const [hotelTo, setHotelTo] = useState("");
  const [bottomLineRate, setBottomLineRate] = useState("");
  const [topLineRate, setTopLineRate] = useState("");
  const [interestedProgramme, setInterestedProgramme] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !marketSource ||
      !marketRegion ||
      !queryType ||
      !queryFor ||
      !queryBaseCity ||
      !sourceType ||
      !contactPerson ||
      !tourStartDate ||
      !tourEndDate ||
      !costingBasis
    ) {
      toast.error("Complete all required Query and travel fields before saving.");
      return;
    }
    if (new Date(tourEndDate) < new Date(tourStartDate)) {
      toast.error("Tour ending date cannot be before the starting date.");
      return;
    }
    // Pax and commercial range are intentionally optional at Query creation.
    // They are populated from the linked Costing/Quotation when it is saved.
    const minPaxValue = minPax ? Math.max(1, Number(minPax)) : undefined;
    const maxPaxValue = maxPax ? Math.max(1, Number(maxPax)) : undefined;
    const pax = maxPaxValue ?? minPaxValue ?? 0;
    const matchedAgent = agents.find((agent) =>
      [agent.agency, agent.email, agent.phone].some(
        (value) => value && [sourcePartner, emailId, contactNumber].includes(value),
      ),
    );
    let matchedClient = clients.find(
      (client) =>
        (emailId && client.email.toLowerCase() === emailId.toLowerCase()) ||
        (contactNumber && client.mobile.replace(/\D/g, "") === contactNumber.replace(/\D/g, "")),
    );
    const isB2B = marketSource === "B2B" || sourceType === "Agent" || sourceType === "Partner";
    try {
      if (!isB2B && !matchedClient) {
        matchedClient = addClient({
          name: contactPerson,
          mobile: contactNumber,
          email: emailId,
          city: queryBaseCity,
          source: marketSource || sourceType || "Direct",
          relationship_owner: user?.name,
          notes: "Created automatically from first B2C Query",
          active: true,
        });
      }
      createLead({
        lead_source: marketSource || sourceType || "Direct",
        customer: sourcePartner || contactPerson || "Direct Guest",
        contact_person: contactPerson,
        market: marketRegion,
        enquiry_type: queryType || costingBasis || "Customized",
        travel_start: tourStartDate,
        travel_end: tourEndDate,
        pax,
        destination: interestedProgramme || tourStartCity || queryBaseCity || tourEndCity,
        priority: "Normal",
        requirement: queryFor,
        created_by: user?.name || "Sales Desk",
        customer_type: isB2B ? "B2B Agent" : "B2C Client",
        agent_id: matchedAgent?.id,
        client_id: matchedClient?.id,
        relationship_owner: matchedAgent?.relationship_owner || matchedClient?.relationship_owner,
        primary_unit: "Madhya Pradesh",
        mobile: contactNumber,
        email: emailId,
        adults: pax,
        children: 0,
        traveler_type: marketRegion.toLowerCase().includes("inbound")
          ? "foreign"
          : queryType.toLowerCase().includes("school") ||
              queryType.toLowerCase().includes("college")
            ? "student"
            : "indian",
        travel_type: costingBasis || queryType,
        cost_price: Number(bottomLineRate) || 0,
        selling_price: Number(topLineRate) || 0,
        min_pax: minPaxValue,
        max_pax: maxPaxValue,
        costing_basis: costingBasis,
        hotel_category_from: hotelFrom,
        hotel_category_to: hotelTo,
        program_id: programmes.find((program) => program.name === interestedProgramme)?.id,
        program_name: interestedProgramme,
        tour_start_city: tourStartCity || undefined,
        tour_end_city: tourEndCity || undefined,
        routing:
          tourStartCity || tourEndCity
            ? `${tourStartCity || "—"} → ${tourEndCity || "—"}`
            : undefined,
      });
      await pushCrmSnapshotNow();
      toast.success("Query created and sent to the Assignment Desk");
      navigate({ to: "/queries/query-tracker" });
    } catch (error) {
      console.error("Query creation failed", error);
      toast.error("Query could not be saved. Please try again.");
    }
  };

  const handleClear = () => {
    setMarketSource("");
    setMarketRegion("");
    setQueryType("");
    setQueryFor("");
    setQueryBaseCity("");
    setSourceType("");
    setSourcePartner("");
    setContactPerson("");
    setContactNumber("");
    setEmailId("");
    setConversationMedium("");
    setTourStartDate("");
    setTourEndDate("");
    setCostingBasis("");
    setTourStartCity("");
    setTourEndCity("");
    setMinPax("");
    setMaxPax("");
    setHotelFrom("");
    setHotelTo("");
    setBottomLineRate("");
    setTopLineRate("");
    setInterestedProgramme("");
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Create New Query</h1>
          <p className="text-sm text-slate-500 mt-1">
            EMP26-27EMP0335 will be generated automatically
          </p>
        </div>
        <button className="text-slate-400 hover:text-slate-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border-0 shadow-none">
          <CardContent className="pt-0 space-y-8">
            {/* Section 1: Lead Information */}
            <div>
              <h2 className="text-teal-700 font-bold uppercase tracking-wide text-sm mb-4">
                Lead Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Market source <span className="text-red-500">*</span>
                  </Label>
                  <Select value={marketSource} onValueChange={setMarketSource}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Market / region <span className="text-red-500">*</span>
                  </Label>
                  <Select value={marketRegion} onValueChange={setMarketRegion}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Query type <span className="text-red-500">*</span>
                  </Label>
                  <Select value={queryType} onValueChange={setQueryType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUERY_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Query for <span className="text-red-500">*</span>
                  </Label>
                  <Select value={queryFor} onValueChange={setQueryFor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUERY_FORS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Query base city <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    list="organisation-partners"
                    placeholder=""
                    value={queryBaseCity}
                    onChange={(e) => setQueryBaseCity(e.target.value)}
                  />
                  <datalist id="organisation-partners">
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.agency} />
                    ))}
                    {clients.map((client) => (
                      <option key={client.id} value={client.name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Source type <span className="text-red-500">*</span>
                  </Label>
                  <Select value={sourceType} onValueChange={setSourceType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Source / partner name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    list="source-relationships"
                    placeholder="Select an existing Agent / Client or enter a new B2C name"
                    value={sourcePartner}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSourcePartner(value);
                      const agent = agents.find(
                        (item) => item.agency === value || item.name === value,
                      );
                      const client = clients.find((item) => item.name === value);
                      if (agent) {
                        setContactPerson(agent.contact_person || agent.name);
                        setContactNumber(agent.phone || "");
                        setEmailId(agent.email || "");
                      } else if (client) {
                        setContactPerson(client.name);
                        setContactNumber(client.mobile || "");
                        setEmailId(client.email || "");
                      }
                    }}
                  />
                  <datalist id="source-relationships">
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.agency || agent.name} />
                    ))}
                    {clients.map((client) => (
                      <option key={client.id} value={client.name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Contact person <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder=""
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                  />
                </div>

                {/* Empty for grid alignment */}
                <div className="hidden md:block"></div>

                <div className="space-y-2">
                  <Label>Contact number</Label>
                  <Input
                    placeholder=""
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email ID</Label>
                  <Input
                    placeholder=""
                    value={emailId}
                    onChange={(e) => setEmailId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Conversation medium <span className="text-red-500">*</span>
                  </Label>
                  <Select value={conversationMedium} onValueChange={setConversationMedium}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONVERSATION_MEDIUMS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section 2: Travel & Commercial */}
            <div>
              <h2 className="text-teal-700 font-bold uppercase tracking-wide text-sm mb-4">
                Travel & Commercial
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Tour starting date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={tourStartDate}
                    onChange={(e) => setTourStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Tour ending date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={tourEndDate}
                    onChange={(e) => setTourEndDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Costing basis <span className="text-red-500">*</span>
                  </Label>
                  <Select value={costingBasis} onValueChange={setCostingBasis}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {COSTING_BASIS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tour starting city</Label>
                  <Input
                    placeholder=""
                    value={tourStartCity}
                    onChange={(e) => setTourStartCity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tour ending city</Label>
                  <Input
                    placeholder=""
                    value={tourEndCity}
                    onChange={(e) => setTourEndCity(e.target.value)}
                  />
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Manager assignment follows creation</p>
                  <p className="mt-1 text-xs">
                    This Query will enter the Assignment Desk as Awaiting Assignment.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3: Costing Range */}
            <div>
              <h2 className="text-teal-700 font-bold uppercase tracking-wide text-sm mb-4">
                Costing Range
              </h2>
              <div className="bg-slate-100 border border-slate-200 rounded-md p-3 text-sm text-slate-600 mb-4">
                Optional at Query creation. These values are populated automatically when a linked
                Costing/Quotation is saved. Enter them here only when the client has already shared
                a firm range.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Minimum pax</Label>
                  <Input type="number" value={minPax} onChange={(e) => setMinPax(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hotel category — from</Label>
                  <Select value={hotelFrom} onValueChange={setHotelFrom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOTEL_CATEGORIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bottom-line Query value</Label>
                  <Input
                    type="number"
                    value={bottomLineRate}
                    onChange={(e) => setBottomLineRate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Maximum pax</Label>
                  <Input type="number" value={maxPax} onChange={(e) => setMaxPax(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hotel category — to</Label>
                  <Select value={hotelTo} onValueChange={setHotelTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOTEL_CATEGORIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Top-line Query value</Label>
                  <Input
                    type="number"
                    value={topLineRate}
                    onChange={(e) => setTopLineRate(e.target.value)}
                  />
                </div>

                <div className="space-y-2 col-span-1 md:col-span-3">
                  <Label>Interested programme</Label>
                  <Select value={interestedProgramme} onValueChange={setInterestedProgramme}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {programmes.map((program) => (
                        <SelectItem key={program.id} value={program.name}>
                          {program.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Derived Summary Bar */}
            <div className="bg-slate-100 border border-slate-200 rounded-md overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-200">
                <div className="p-4">
                  <p className="text-xs font-semibold text-teal-700 uppercase mb-1">Query Date</p>
                  <p className="text-sm font-bold text-slate-900">
                    {new Date().toLocaleDateString("en-GB")}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-teal-700 uppercase mb-1">Duration</p>
                  <p className="text-sm font-bold text-slate-900">
                    {tourStartDate && tourEndDate
                      ? `${Math.max(1, Math.round((new Date(tourEndDate).getTime() - new Date(tourStartDate).getTime()) / 86400000) + 1)} days`
                      : "—"}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-teal-700 uppercase mb-1">Travel Month</p>
                  <p className="text-sm font-bold text-slate-900">
                    {tourStartDate
                      ? new Date(tourStartDate).toLocaleDateString("en-GB", {
                          month: "long",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-teal-700 uppercase mb-1">
                    Bottom-line Value
                  </p>
                  <p className="text-sm font-bold text-teal-700">
                    ₹{(Number(bottomLineRate) || 0).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold text-teal-700 uppercase mb-1">
                    Top-line Value
                  </p>
                  <p className="text-sm font-bold text-teal-700">
                    ₹{(Number(topLineRate) || 0).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Fields marked * are required. Derived fields are saved automatically.
              </p>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={handleClear}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-teal-700 hover:bg-teal-800 text-white">
                  Create Query
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

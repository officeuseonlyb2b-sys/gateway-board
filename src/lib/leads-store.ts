import { create } from 'zustand';

export interface Query {
  id: string;
  dates: string;
  destination: string;
  type: string;
  customer: string;
  stage: string;
  owner: string;
  value: string;
  action: string;
  due: string;
  // extra fields for detail view
  partner?: string;
  contact?: string;
  phone?: string;
  email?: string;
  market?: string;
  source?: string;
  leadId?: string;
  travelDates?: string;
  travellers?: string;
  assignedOn?: string;
  nextAction?: string;
  followUpDue?: string;
  timeline?: Array<{date: string, event: string}>;
  activities?: Array<{time: string, text: string, user: string}>;
  commercial?: {
    costPrice: string;
    sellingPrice: string;
    margin: string;
    commission: string;
    netAfterCommission: string;
  };
}

interface LeadStore {
  queries: Query[];
  addLead: (leadData: any) => void;
}

function generateId(prefix: string) {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth()+1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const random = Math.floor(Math.random() * 1000).toString().padStart(4, '0');
  return `${prefix}-${day}${month}${year}-${random}`;
}

// Helper to format date
function formatDate(dateString: string) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const useLeadStore = create<LeadStore>((set) => ({
  queries: [], // start empty – you can seed with demo data if you want

  addLead: (leadData) => {
    const queryId = generateId('QRY');
    const leadId = generateId('LD');
    const assignedTo = "Rahul Sharma";
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(now.getDate() + 2);

    const displayDate = leadData.travelDates ? formatDate(leadData.travelDates) : '';
    const dueStr = dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const value = "₹ " + (Math.floor(Math.random() * 1000000) + 100000).toLocaleString('en-IN');
    const stage = "New";
    const action = "Review Requirement";

    const newQuery: Query = {
      id: queryId,
      dates: displayDate,
      destination: leadData.destination || "Madhya Pradesh",
      type: leadData.enquiryType || "Family Tour",
      customer: leadData.sourcePartner || "ABC Travels",
      stage: stage,
      owner: assignedTo,
      value: value,
      action: action,
      due: dueStr,
      partner: leadData.sourcePartner || "ABC Travels",
      contact: leadData.contactPerson || "Amit Sharma",
      phone: "+91 98765 43210",
      email: "client@example.com",
      market: leadData.market || "Domestic - India",
      source: leadData.leadSource || "Website",
      leadId: leadId,
      travelDates: leadData.travelDates || "",
      travellers: leadData.numTravellers ? `${leadData.numTravellers} Pax` : "4 Pax",
      assignedOn: now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      nextAction: action,
      followUpDue: dueStr,
      timeline: [
        { date: now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), event: "New" },
      ],
      activities: [
        { time: now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), text: "Lead created", user: assignedTo },
      ],
      commercial: {
        costPrice: "₹ 0",
        sellingPrice: value,
        margin: "₹ 0 (0%)",
        commission: "₹ 0",
        netAfterCommission: value,
      },
    };

    set((state) => ({
      queries: [...state.queries, newQuery],
    }));
  },
}));
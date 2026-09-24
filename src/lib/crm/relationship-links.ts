import type { Client } from "./clients-store";
import type { CrmQuery } from "./types";
import type { Agent } from "../wizard/agents-store";

const textKey = (value?: string) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
const emailKey = (value?: string) => {
  const email = textKey(value);
  return ["", "-", "na", "n/a", "unknown"].includes(email) ? "" : email;
};
const phoneKey = (value?: string) => {
  const phone = (value || "").replace(/\D/g, "");
  return phone.length >= 7 ? phone : "";
};

export function queryMatchesAgent(query: CrmQuery, agent: Agent): boolean {
  if (query.customer_type !== "B2B Agent") return false;
  if (query.agent_id === agent.id) return true;
  if (textKey(query.customer) && textKey(query.customer) === textKey(agent.agency)) return true;
  if (emailKey(query.email) && emailKey(query.email) === emailKey(agent.email)) return true;
  if (phoneKey(query.mobile) && phoneKey(query.mobile) === phoneKey(agent.phone)) return true;
  return false;
}

export function queryMatchesClient(query: CrmQuery, client: Client): boolean {
  if (query.customer_type !== "B2C Client") return false;
  if (query.client_id === client.id) return true;
  if (emailKey(query.email) && emailKey(query.email) === emailKey(client.email)) return true;
  if (phoneKey(query.mobile) && phoneKey(query.mobile) === phoneKey(client.mobile)) return true;
  return Boolean(
    textKey(query.contact_person) &&
    textKey(query.contact_person) === textKey(client.name) &&
    textKey(query.query_base_city) === textKey(client.city),
  );
}

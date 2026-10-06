import type { SavedProgram } from "@/lib/wizard/agents-store";
import type { CrmQuery } from "./types";
import { queryLostValue, queryOpenValue, queryWonValue } from "./relationship-insights";

const normalize = (value?: string) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");

export function queryMatchesProgram(query: CrmQuery, program: SavedProgram) {
  if (
    normalize(query.program_id) &&
    [program.id, program.code].some((value) => normalize(value) === normalize(query.program_id))
  )
    return true;
  if (normalize(query.program_name) && normalize(query.program_name) === normalize(program.name))
    return true;
  return Boolean(
    normalize(query.routing) &&
    normalize(program.routing_summary) &&
    normalize(query.routing) === normalize(program.routing_summary),
  );
}

export function programMetrics(program: SavedProgram, queries: CrmQuery[]) {
  const linked = queries.filter((query) => queryMatchesProgram(query, program));
  const open = linked.filter((query) => !["Won", "Lost"].includes(query.stage));
  const won = linked.filter((query) => query.stage === "Won");
  const lost = linked.filter((query) => query.stage === "Lost");
  return {
    linked,
    open,
    won,
    lost,
    wonValue: won.reduce((sum, query) => sum + queryWonValue(query), 0),
    openValue: open.reduce((sum, query) => sum + queryOpenValue(query), 0),
    lostValue: lost.reduce((sum, query) => sum + queryLostValue(query), 0),
    conversion: linked.length ? (won.length / linked.length) * 100 : 0,
  };
}

export const programMoney = (value: number) => {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)} L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)} K`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

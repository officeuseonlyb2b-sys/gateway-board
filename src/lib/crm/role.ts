// Compatibility helpers. A browser-stored role never grants application access.
import { auth } from "@/lib/auth-mock";
import { employeeAccountActive, employeeForAuthUser, useAccessProfile } from "./access";
import { listEmployees } from "./store";
import type { AppRole } from "./types";

export type CrmRole = AppRole;
export function getCrmRole(): CrmRole | "" {
  const employee = employeeForAuthUser(listEmployees(), auth.current());
  return employeeAccountActive(employee) ? employee!.role : "";
}
export function useCrmRole(): CrmRole | "" {
  return useAccessProfile().role;
}
export function useIsManager(): boolean {
  return useAccessProfile().canManageTeam;
}

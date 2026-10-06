import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

export const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export function clients() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey =
    Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    admin: createClient(url, serviceKey, options),
    auth: createClient(url, publicKey, options),
  };
}
export type EmployeeRecord = {
  id: string;
  name: string;
  employee_code: string;
  auth_user_id: string;
  auth_login_email: string;
  role: string;
  active: boolean;
  employee_status: string;
  account_status: string;
  [key: string]: unknown;
};
export const activeEmployee = (employee?: EmployeeRecord | null) =>
  Boolean(
    employee?.auth_user_id &&
    employee.active === true &&
    employee.employee_status !== "Exited" &&
    employee.account_status === "Active",
  );
export const validPassword = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 12 && value.length <= 128;

export async function requireSuperAdmin(
  request: Request,
  admin: ReturnType<typeof clients>["admin"],
) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const result = await admin
    .from("crm_employees")
    .select("id,data")
    .eq("data->>auth_user_id", data.user.id)
    .maybeSingle();
  const employee = result.data?.data as EmployeeRecord | undefined;
  return !result.error && activeEmployee(employee) && employee?.role === "Super Admin"
    ? data.user
    : null;
}

import {
  activeEmployee,
  clients,
  headers,
  json,
  type EmployeeRecord,
} from "../_shared/employee-auth.ts";

const failure = () => json({ error: "Invalid Employee ID or password." }, 401);
export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await request.json();
    const code = typeof body.loginId === "string" ? body.loginId.trim().toUpperCase() : "";
    if (
      !/^(EMP-\d{4,}|ADMIN-001)$/.test(code) ||
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 128
    )
      return failure();
    const { admin, auth } = clients();
    const found = await admin
      .from("crm_employees")
      .select("data")
      .eq("data->>employee_code", code)
      .maybeSingle();
    const employee = found.data?.data as EmployeeRecord | undefined;
    // Always use the normal password Auth endpoint, including unknown codes, for its rate limits.
    const email =
      !found.error && activeEmployee(employee) && employee?.auth_login_email
        ? employee.auth_login_email
        : `${code.toLowerCase()}@invalid.employee.mptourism.in`;
    const { data, error } = await auth.auth.signInWithPassword({ email, password: body.password });
    if (
      error ||
      !data.session ||
      !activeEmployee(employee) ||
      data.user?.id !== employee?.auth_user_id
    )
      return failure();
    // Recheck after authentication to close a concurrent disable/delete window.
    const latest = await admin
      .from("crm_employees")
      .select("data")
      .eq("data->>auth_user_id", data.user.id)
      .maybeSingle();
    if (latest.error || !activeEmployee(latest.data?.data as EmployeeRecord)) return failure();
    return json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch {
    return failure();
  }
}
Deno.serve(handleRequest);

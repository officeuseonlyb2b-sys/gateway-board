import { createClient } from "@supabase/supabase-js";

export const ADMIN_EMAIL = "admin@mptourism.in";
export function serverClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in the process environment.",
    );
  if (process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() !== ADMIN_EMAIL) {
    throw new Error(
      `Set SUPER_ADMIN_EMAIL=${ADMIN_EMAIL}. This is the permanent bootstrap account.`,
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readInventory(client) {
  const employees = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("crm_employees")
      .select("id,data,created_at")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    employees.push(...data);
    if (data.length < 1000) break;
  }
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return { employees, users };
}

export function resetPlan({ employees, users }) {
  const adminUser = users.find((user) => user.email?.toLowerCase() === ADMIN_EMAIL);
  const linked = employees.filter((row) => adminUser && row.data.auth_user_id === adminUser.id);
  const byEmail = employees.filter((row) =>
    [row.data.email, row.data.auth_login_email].some(
      (email) => email?.toLowerCase() === ADMIN_EMAIL,
    ),
  );
  const keep = linked.find((row) => row.data.role === "Super Admin") || linked[0] || byEmail[0];
  const removed = employees.filter((row) => row.id !== keep?.id);
  const ids = new Set(removed.map((row) => row.data.auth_user_id).filter(Boolean));
  const rowIds = new Set(removed.map((row) => row.id));
  const emails = new Set(
    removed
      .flatMap((row) => [row.data.email, row.data.auth_login_email])
      .filter(Boolean)
      .map((email) => email.toLowerCase()),
  );
  // Exact old-row linkage or CRM membership only. Never delete all project Auth users.
  const removedUsers = users.filter(
    (user) =>
      user.id !== adminUser?.id &&
      user.email?.toLowerCase() !== ADMIN_EMAIL &&
      (ids.has(user.id) ||
        emails.has(user.email?.toLowerCase()) ||
        rowIds.has(user.app_metadata?.employee_id) ||
        rowIds.has(user.user_metadata?.employee_id) ||
        user.app_metadata?.crm_application === "mp-tourism"),
  );
  return {
    adminUser,
    keep,
    removed,
    removedUsers,
    unrelatedUsers: users.length - removedUsers.length - (adminUser ? 1 : 0),
  };
}

export async function checkForeignKeys(client) {
  const { data, error } = await client.rpc("employee_cleanup_foreign_keys");
  if (error)
    throw new Error(
      "Foreign-key preflight unavailable. Apply the employee identity migration before cleanup.",
    );
  if (!Array.isArray(data) || data.length)
    throw new Error(`Cleanup blocked by business foreign keys: ${JSON.stringify(data)}`);
}

export async function ensureSuperAdmin(client, plan) {
  let user = plan.adminUser;
  let created = false;
  if (!user) {
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!password || password.length < 12 || password.length > 128)
      throw new Error(
        "Creating Super Admin requires SUPER_ADMIN_PASSWORD (12–128 characters) in the process environment.",
      );
    const result = await client.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password,
      email_confirm: true,
      app_metadata: { crm_application: "mp-tourism" },
      user_metadata: { full_name: "Super Admin" },
    });
    if (result.error)
      throw new Error(
        "Could not create Super Admin Auth account. Check the configured password policy.",
      );
    user = result.data.user;
    created = true;
  }
  const id = plan.keep?.id || crypto.randomUUID();
  const employee = {
    ...plan.keep?.data,
    id,
    name: "Super Admin",
    email: ADMIN_EMAIL,
    auth_login_email: ADMIN_EMAIL,
    auth_user_id: user.id,
    employee_code: "ADMIN-001",
    role: "Super Admin",
    department: "Admin",
    data_scope: "Organisation",
    dashboard_template: "Admin Console",
    active: true,
    employee_status: "Active",
    account_status: "Active",
    designation: "System Administrator",
    joined_at: plan.keep?.data.joined_at || new Date().toISOString(),
  };
  const saved = await client
    .from("crm_employees")
    .upsert({ id, data: employee }, { onConflict: "id" });
  if (saved.error) {
    if (created) {
      const rollback = await client.auth.admin.deleteUser(user.id);
      if (rollback.error)
        throw new Error(`Bootstrap failed; remove partial Auth account ${user.id} manually.`);
    }
    throw new Error(
      "Could not link Super Admin. Resolve conflicting Employee ID/Auth linkage before retrying.",
    );
  }
  const unban = await client.auth.admin.updateUserById(user.id, {
    ban_duration: "none",
    email_confirm: true,
  });
  if (unban.error)
    throw new Error(
      "Super Admin is linked but the Auth account could not be activated. Retry bootstrap.",
    );
  return employee;
}

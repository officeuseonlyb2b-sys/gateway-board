import {
  activeEmployee,
  clients,
  headers,
  json,
  requireSuperAdmin,
  validPassword,
  type EmployeeRecord,
} from "../_shared/employee-auth.ts";

export async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const { admin } = clients();
  try {
    const caller = await requireSuperAdmin(request, admin);
    if (!caller) return json({ error: "An active linked Super Admin is required." }, 403);
    const body = await request.json();
    const { action, employeeId, password } = body;
    const approvedRoles = ["Sales Manager", "Senior Sales Executive", "Sales Executive"];
    if (["create_employee", "reset_password"].includes(action) && !validPassword(password)) {
      return json({ error: "Password must contain 12 to 128 characters." }, 400);
    }
    if (
      ["create_employee", "edit_employee"].includes(action) &&
      (typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 120 ||
        (body.phone != null && (typeof body.phone !== "string" || body.phone.length > 40)))
    ) {
      return json(
        { error: "Enter a full name (up to 120 characters) and a valid phone number." },
        400,
      );
    }

    if (action === "create_employee") {
      if (!approvedRoles.includes(body.role))
        return json({ error: "Select an approved Sales role." }, 400);
      // The sequence is atomic across concurrent requests. Database uniqueness is the final guard.
      const codeResult = await admin.rpc("next_employee_code");
      if (codeResult.error || !codeResult.data) throw new Error("Unable to allocate Employee ID.");
      const code = String(codeResult.data);
      const duplicate = await admin
        .from("crm_employees")
        .select("id")
        .eq("data->>employee_code", code)
        .maybeSingle();
      if (duplicate.error || duplicate.data)
        throw new Error("Employee ID allocation failed. Please retry.");
      const id = crypto.randomUUID();
      const email = `${code.toLowerCase()}@employee.mptourism.in`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { crm_application: "mp-tourism", employee_id: id },
        user_metadata: { full_name: body.name.trim() },
      });
      if (created.error || !created.data.user)
        throw new Error("Unable to create login. Check the password policy and retry.");
      const employee = {
        id,
        name: body.name.trim(),
        phone: (body.phone || "").trim(),
        email: "",
        auth_login_email: email,
        auth_user_id: created.data.user.id,
        employee_code: code,
        role: body.role,
        department: "Sales",
        data_scope: body.role === "Sales Manager" ? "Team" : "Own",
        dashboard_template: body.role === "Sales Manager" ? "Sales Control Tower" : "My Sales Desk",
        active: true,
        employee_status: "Active",
        account_status: "Active",
        joined_at: new Date().toISOString(),
        permissions: [],
        permission_grants: [],
        permission_restrictions: [],
        created_by_auth_user_id: caller.id,
      };
      const saved = await admin.from("crm_employees").insert({ id, data: employee });
      if (saved.error) {
        const rollback = await admin.auth.admin.deleteUser(created.data.user.id);
        if (rollback.error) {
          // Fail closed even if the Auth API is temporarily unavailable; retry cleanup explicitly.
          await admin.auth.admin.updateUserById(created.data.user.id, { ban_duration: "876000h" });
          console.error(
            "Employee creation compensation required for Auth UUID",
            created.data.user.id,
          );
          return json(
            {
              error: "Employee creation failed. Administrator cleanup is required.",
              orphanAuthUserId: created.data.user.id,
            },
            500,
          );
        }
        throw new Error("Employee creation failed; the partial login was removed.");
      }
      return json({ employee, employeeCode: code });
    }

    if (
      !["edit_employee", "reset_password", "set_status", "delete_employee"].includes(action) ||
      typeof employeeId !== "string"
    ) {
      return json({ error: "Invalid account action." }, 400);
    }
    const found = await admin
      .from("crm_employees")
      .select("id,data")
      .eq("id", employeeId)
      .maybeSingle();
    if (found.error || !found.data) return json({ error: "Employee not found." }, 404);
    const employee = found.data.data as EmployeeRecord;
    // Protect the permanent administrator at both API and database levels.
    if (employee.role === "Super Admin" || employee.auth_user_id === caller.id) {
      return json({ error: "The permanent Super Admin account cannot be changed here." }, 403);
    }
    if (action === "edit_employee") {
      if (!approvedRoles.includes(body.role))
        return json({ error: "Select an approved Sales role." }, 400);
      const updated = {
        ...employee,
        name: body.name.trim(),
        phone: (body.phone || "").trim(),
        role: body.role,
        department: "Sales",
        data_scope: body.role === "Sales Manager" ? "Team" : "Own",
        dashboard_template: body.role === "Sales Manager" ? "Sales Control Tower" : "My Sales Desk",
      };
      const result = await admin
        .from("crm_employees")
        .update({ data: updated })
        .eq("id", employeeId);
      if (result.error) throw new Error("Unable to update employee.");
      return json({ employee: updated });
    }
    if (!employee.auth_user_id && action !== "delete_employee")
      return json({ error: "Employee login is not linked." }, 409);
    if (action === "reset_password") {
      const result = await admin.auth.admin.updateUserById(employee.auth_user_id, { password });
      if (result.error)
        throw new Error("Password reset failed. Check the password policy and retry.");
      return json({ ok: true });
    }
    if (action === "set_status") {
      if (typeof body.enabled !== "boolean")
        return json({ error: "Login status is required." }, 400);
      if (body.enabled && employee.employee_status === "Exited")
        return json({ error: "Exited employees cannot be enabled." }, 400);
      const updated = {
        ...employee,
        active: body.enabled,
        account_status: body.enabled ? "Active" : "Disabled",
      };
      // Disable the authoritative row FIRST so outstanding JWTs immediately lose RLS access.
      if (!body.enabled) {
        const disabled = await admin
          .from("crm_employees")
          .update({ data: updated })
          .eq("id", employeeId);
        if (disabled.error) throw new Error("Unable to disable employee.");
      }
      const result = await admin.auth.admin.updateUserById(employee.auth_user_id, {
        ban_duration: body.enabled ? "none" : "876000h",
      });
      if (result.error)
        throw new Error(
          body.enabled
            ? "Unable to enable login."
            : "App access is disabled. Retry to finish disabling the Auth login.",
        );
      if (body.enabled) {
        const enabled = await admin
          .from("crm_employees")
          .update({ data: updated })
          .eq("id", employeeId);
        if (enabled.error) {
          await admin.auth.admin.updateUserById(employee.auth_user_id, { ban_duration: "876000h" });
          throw new Error("Unable to enable employee. Login remains blocked.");
        }
      }
      return json({ employee: updated });
    }
    if (action === "delete_employee") {
      const safety = await admin.rpc("employee_cleanup_foreign_keys");
      if (safety.error || !Array.isArray(safety.data) || safety.data.length) {
        return json(
          {
            error:
              "Deletion blocked: database foreign keys require review to preserve business records.",
          },
          409,
        );
      }
      const blocked = await admin
        .from("crm_employees")
        .update({ data: { ...employee, active: false, account_status: "Disabled" } })
        .eq("id", employeeId);
      if (blocked.error) throw new Error("Unable to block login before deletion.");
      if (employee.auth_user_id) {
        const deleted = await admin.auth.admin.deleteUser(employee.auth_user_id);
        if (deleted.error && deleted.error.status !== 404)
          throw new Error("Login blocked. Retry deletion to finish removing the Auth account.");
      }
      const removed = await admin.from("crm_employees").delete().eq("id", employeeId);
      if (removed.error)
        throw new Error("Login removed. Retry deletion to remove the Employee Master row.");
      return json({ ok: true });
    }
    return json({ error: "Invalid account action." }, 400);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Account operation failed." },
      400,
    );
  }
}
Deno.serve(handleRequest);

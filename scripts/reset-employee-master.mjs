import {
  ADMIN_EMAIL,
  serverClient,
  readInventory,
  resetPlan,
  checkForeignKeys,
  ensureSuperAdmin,
} from "./employee-admin-utils.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--apply"].includes(args[0])) {
    throw new Error("Explicit mode required: npm run employees:reset -- --dry-run OR --apply");
  }
  if (args[0] === "--apply" && process.env.EMPLOYEE_RESET_CONFIRM !== "DELETE_OLD_EMPLOYEES") {
    throw new Error(
      "Apply requires EMPLOYEE_RESET_CONFIRM=DELETE_OLD_EMPLOYEES in addition to --apply.",
    );
  }
  const client = serverClient();
  const inventory = await readInventory(client);
  const plan = resetPlan(inventory);
  console.log(
    `Super Admin preserved: ${ADMIN_EMAIL}; Employee ID ADMIN-001; Auth ${plan.adminUser?.id || "will be created on apply"}; row ${plan.keep?.id || "will be created on apply"}`,
  );
  console.log("Employee rows to remove:");
  console.table(
    plan.removed.map((row) => ({
      id: row.id,
      employee_code: row.data.employee_code,
      name: row.data.name,
      auth_user_id: row.data.auth_user_id,
    })),
  );
  console.log("CRM-associated Auth users to remove:");
  console.table(plan.removedUsers.map((user) => ({ id: user.id, email: user.email })));
  console.log(
    JSON.stringify(
      {
        employeeRowsRemoved: plan.removed.length,
        authUsersRemoved: plan.removedUsers.length,
        adminRowsUpserted: 1,
        unrelatedAuthUsersPreserved: plan.unrelatedUsers,
        businessRowsModified: 0,
      },
      null,
      2,
    ),
  );
  await checkForeignKeys(client);
  console.log("Foreign-key preflight passed: no business-table dependencies.");
  if (args[0] === "--dry-run") {
    console.log("DRY RUN: no writes performed. Inspect this plan before using --apply.");
  } else {
    // Run while employee management is quiescent. Never touch queries, tasks or events.
    const preservedAdmin = await ensureSuperAdmin(client, plan);
    for (const row of plan.removed) {
      const result = await client
        .from("crm_employees")
        .update({ data: { ...row.data, active: false, account_status: "Disabled" } })
        .eq("id", row.id);
      if (result.error) throw new Error(`Could not block employee ${row.id}; cleanup stopped.`);
    }
    // Keep the linkage rows until Auth deletion succeeds so retries remain safe.
    for (const user of plan.removedUsers) {
      const result = await client.auth.admin.deleteUser(user.id);
      if (result.error && result.error.status !== 404)
        throw new Error(
          `Could not delete Auth user ${user.id}; retry cleanup after resolving the error.`,
        );
    }
    for (const row of plan.removed) {
      const result = await client.from("crm_employees").delete().eq("id", row.id);
      if (result.error) throw new Error(`Could not delete employee ${row.id}; retry cleanup.`);
    }
    const remaining = await readInventory(client);
    if (
      remaining.employees.length !== 1 ||
      remaining.employees[0].data.auth_user_id !== preservedAdmin.auth_user_id ||
      remaining.employees[0].data.role !== "Super Admin" ||
      !remaining.employees[0].data.active ||
      remaining.users.some((user) => plan.removedUsers.some((removed) => removed.id === user.id))
    ) {
      throw new Error("Cleanup encountered concurrent changes. Re-run dry-run and review.");
    }
    console.log(
      "Employee reset applied. Only the linked Super Admin remains in Employee Master. Business records were not modified.",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import {
  serverClient,
  readInventory,
  resetPlan,
  ensureSuperAdmin,
} from "./employee-admin-utils.mjs";

try {
  const client = serverClient();
  const plan = resetPlan(await readInventory(client));
  const admin = await ensureSuperAdmin(client, plan);
  console.log(
    `Super Admin linked: ${admin.employee_code} (${admin.email}); Auth UUID ${admin.auth_user_id}.`,
  );
  console.log("No business records or existing passwords were changed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const masters = await readFile(new URL("../src/lib/masters-remote.ts", import.meta.url), "utf8");
const destinations = await readFile(new URL("../src/lib/destinations-remote.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const authMigration = await readFile(new URL("../supabase/migrations/20261106103000_staging_master_authorization_functions.sql", import.meta.url), "utf8");
const masterMigration = await readFile(new URL("../supabase/migrations/20261106110000_staging_master_catalogue_schema.sql", import.meta.url), "utf8");

assert.match(masters, /MasterSyncStatus[\s\S]*"uninitialized"/);
assert.match(masters, /Staging master catalogue not initialized\. No browser-local master data was uploaded\./);
assert.match(masters, /export async function initializeSharedMastersFromLocal/);
assert.doesNotMatch(masters, /ready = true;\s*await pushNow\(db\.get\(\)\);\s*setSyncState\(\{ status: "ready", message: "", source: "masters" \}\)/);
assert.match(masters, /if \(!ready\) return;[\s\S]*onInitialPull\.forEach/);

assert.match(destinations, /export async function initializeDestinationsFromLocal/);
assert.match(destinations, /startup will not seed browser-local destinations/);
assert.match(destinations, /Staging destination catalogue not initialized\. No browser-local destination data was uploaded\./);
assert.doesNotMatch(destinations, /await seedRemoteFromLocal\(\);\s*const again = await fetchAll\(\)/);

assert.match(layout, /masterSync\.status === "uninitialized"/);
assert.match(layout, /Staging master catalogue not initialized\./);

assert.match(authMigration, /public\.crm_employees\.data must be jsonb/);
assert.match(authMigration, /app\.staging_project_ref/);
assert.match(authMigration, /FORCE ROW LEVEL SECURITY/);
assert.match(authMigration, /security definer/);
assert.match(authMigration, /auth\.uid\(\)::text/);
assert.match(authMigration, /revoke all on function public\.is_linked_super_admin\(\) from public, anon/);
assert.match(masterMigration, /to_regprocedure\('public\.is_linked_super_admin\(\)'\)/);
assert.match(masterMigration, /app\.staging_project_ref/);
assert.ok("20261106103000" < "20261106110000", "authorization migration must precede the catalogue migration");
assert.match(masterMigration, /to_regprocedure\('public\.is_linked_costing_master_reader\(\)'\)/);

console.log("Master initialization guard contract passed: startup remains read-only for missing/empty staging catalogues.");

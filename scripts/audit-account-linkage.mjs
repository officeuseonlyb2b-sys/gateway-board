// Behavioral regression tests against the actual TypeScript handlers and store.
// Fixtures exist only in isolated VM contexts; no test contacts the live project.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import { resetPlan } from "./employee-admin-utils.mjs";

let checks = 0;
async function check(label, run) {
  await run();
  checks++;
  console.log(`PASS ${label}`);
}
function loadTs(path, imports = {}, globals = {}) {
  const source = fs.readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(
    compiled.outputText,
    {
      exports,
      require: (name) => {
        if (!(name in imports)) throw new Error(`Unexpected import ${name} in ${path}`);
        return imports[name];
      },
      console,
      crypto: globalThis.crypto,
      Request,
      Response,
      Headers,
      setTimeout,
      clearTimeout,
      ...globals,
    },
    { filename: path },
  );
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const adminEmployee = {
  id: randomUUID(),
  name: "Test administrator",
  employee_code: "ADMIN-001",
  auth_user_id: randomUUID(),
  auth_login_email: "admin@mptourism.in",
  role: "Super Admin",
  active: true,
  employee_status: "Active",
  account_status: "Active",
};
let cache = [adminEmployee];
const access = loadTs("src/lib/crm/access.ts", {
  "@/lib/auth-mock": { useAuth: () => ({ id: adminEmployee.auth_user_id }) },
  "./store": { listEmployees: () => cache, useEmployees: () => cache, useCrmQueries: () => [] },
});
await check(
  "Auth linkage requires exactly one matching Auth UUID; email and metadata cannot grant access",
  () => {
    assert.equal(
      access.employeeForAuthUser(cache, {
        id: "unlinked",
        email: "admin@mptourism.in",
        employeeId: adminEmployee.id,
      }),
      undefined,
    );
    assert.equal(
      access.employeeForAuthUser([...cache, ...cache], { id: adminEmployee.auth_user_id }),
      undefined,
    );
    assert.equal(
      access.employeeForAuthUser(cache, { id: adminEmployee.auth_user_id }),
      adminEmployee,
    );
  },
);
await check(
  "Super Admin can open every existing authenticated route; generic Employee is confined to personal routes",
  () => {
    const files = fs
      .readdirSync("src/routes/_authenticated", { recursive: true })
      .filter((path) => path.endsWith(".tsx"));
    for (const file of files) {
      const path =
        "/" +
        file
          .replaceAll("\\", "/")
          .replace(/\.tsx$/, "")
          .replace(/\/index$/, "");
      assert.equal(
        access.canAccessPath({ accountReady: true, role: "Super Admin" }, path),
        true,
        path,
      );
      assert.equal(
        access.canAccessPath({ accountReady: false, role: "Super Admin" }, path),
        false,
        path,
      );
      assert.equal(
        access.canAccessPath({ accountReady: true, role: "Employee" }, path),
        ["/employee-home", "/profile", "/help"].includes(path),
        path,
      );
    }
    assert.equal(access.dashboardPathForUser({ id: adminEmployee.auth_user_id }), "/admin-console");
    cache = [];
    assert.equal(access.useAccessProfile().accountReady, false);
    assert.equal(access.useAccessProfile().role, "");
    assert.deepEqual(plain(access.useAccessProfile().permissions), []);
  },
);

const storage = new Map([
  ["mp_crm_employees_v2", JSON.stringify([adminEmployee])],
  ["mp_crm_employee_roster_revision", "obsolete"],
  ["mp_crm_query_dataset_revision", "test-dataset"],
  ["mp_crm_queries_v2", "[]"],
  ["mp_crm_tasks_v2", "[]"],
  ["mp_crm_events_v2", "[]"],
  ["unrelated-cache", "preserve"],
]);
const store = loadTs(
  "src/lib/crm/store.ts",
  {
    react: { useSyncExternalStore: (_subscribe, get) => get() },
    "./types": { LIFECYCLE: [] },
    "./query-tracker-import.generated": {
      IMPORTED_QUERIES: [],
      IMPORTED_QUERY_EVENTS: [],
      IMPORTED_QUERY_TASKS: [],
      QUERY_TRACKER_DATASET_ID: "test-dataset",
    },
  },
  {
    window: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  },
);
await check(
  "Obsolete employee cache is cleared once; empty load/hydration cannot recreate employees",
  () => {
    assert.equal(store.listEmployees().length, 0);
    assert.equal(storage.has("mp_crm_employees_v2"), false);
    assert.equal(storage.has("mp_crm_employee_roster_revision"), false);
    assert.equal(storage.get("unrelated-cache"), "preserve");
    assert.equal(storage.get("mp_crm_employee_cache_version"), "3");
    let pushes = 0;
    store.onCrmPersist(() => pushes++);
    const before = plain(store.getCrmSnapshot());
    store.replaceEmployeesFromCloud([adminEmployee]);
    assert.equal(store.listEmployees().length, 1);
    store.replaceEmployeesFromCloud([]);
    assert.equal(pushes, 0);
    assert.deepEqual(plain(store.getCrmSnapshot()), before);
    store.hydrateCrm({ queries: [], tasks: [], events: [], employees: [] });
    assert.equal(store.listEmployees().length, 0);
  },
);

const rows = new Map([[adminEmployee.id, { id: adminEmployee.id, data: plain(adminEmployee) }]]);
const users = new Map([
  [adminEmployee.auth_user_id, { id: adminEmployee.auth_user_id, email: "admin@mptourism.in" }],
]);
const passwords = new Map();
const banned = new Set();
let sequence = 0;
let failInsert = false;
let foreignKeys = [];
const business = {
  queries: [{ owner: "Historical owner" }],
  tasks: [{ owner: "Historical owner" }],
  events: [{ by: "Historical actor" }],
  quotes: [{ total: 123 }],
};
const beforeBusiness = JSON.stringify(business);
const mutations = [];
function query(table) {
  assert.equal(table, "crm_employees", "Account actions may only write Employee Master");
  let op = "select",
    value,
    single = false;
  const filters = [];
  const builder = {
    select() {
      return builder;
    },
    eq(key, expected) {
      filters.push([key, expected]);
      return builder;
    },
    maybeSingle() {
      single = true;
      return builder;
    },
    order() {
      return builder;
    },
    range() {
      return builder;
    },
    insert(input) {
      op = "insert";
      value = input;
      return builder;
    },
    update(input) {
      op = "update";
      value = input;
      return builder;
    },
    delete() {
      op = "delete";
      return builder;
    },
    then(resolve, reject) {
      try {
        if (op === "insert") {
          if (failInsert)
            return Promise.resolve({ data: null, error: { message: "Injected failure" } }).then(
              resolve,
              reject,
            );
          rows.set(value.id, plain(value));
          mutations.push(op);
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        const found = [...rows.values()].filter((row) =>
          filters.every(
            ([key, expected]) =>
              (key.startsWith("data->>") ? row.data[key.slice(7)] : row[key]) === expected,
          ),
        );
        if (op === "update") found.forEach((row) => rows.set(row.id, { ...row, ...plain(value) }));
        if (op === "delete") found.forEach((row) => rows.delete(row.id));
        if (op !== "select") mutations.push(op);
        return Promise.resolve({ data: single ? found[0] || null : found, error: null }).then(
          resolve,
          reject,
        );
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    },
  };
  return builder;
}
const adminClient = {
  from: query,
  rpc: async (name) => ({
    data:
      name === "next_employee_code" ? `EMP-${String(++sequence).padStart(4, "0")}` : foreignKeys,
    error: null,
  }),
  auth: {
    getUser: async (token) => ({ data: { user: users.get(token) || null }, error: null }),
    admin: {
      createUser: async (input) => {
        const user = { id: randomUUID(), email: input.email, app_metadata: input.app_metadata };
        users.set(user.id, user);
        passwords.set(user.id, input.password);
        return { data: { user }, error: null };
      },
      updateUserById: async (id, input) => {
        if (input.password) passwords.set(id, input.password);
        if (input.ban_duration === "none") banned.delete(id);
        else if (input.ban_duration) banned.add(id);
        return { data: { user: users.get(id) }, error: null };
      },
      deleteUser: async (id) => {
        users.delete(id);
        passwords.delete(id);
        return { error: null };
      },
    },
  },
};
const authClient = {
  auth: {
    signInWithPassword: async ({ email, password }) => {
      const user = [...users.values()].find((user) => user.email === email);
      return user && !banned.has(user.id) && passwords.get(user.id) === password
        ? {
            data: { user, session: { access_token: user.id, refresh_token: randomUUID() } },
            error: null,
          }
        : { data: {}, error: { message: "Invalid credentials" } };
    },
  },
};
const Deno = {
  env: {
    get: (name) =>
      name.includes("SERVICE") || name.includes("SECRET") ? "test-service-key" : "test-public-key",
  },
  serve: () => {},
};
const shared = loadTs(
  "supabase/functions/_shared/employee-auth.ts",
  {
    "https://esm.sh/@supabase/supabase-js@2.112.3": {
      createClient: (_url, key) => (key === "test-service-key" ? adminClient : authClient),
    },
  },
  { Deno },
);
const manage = loadTs(
  "supabase/functions/manage-employee-account/index.ts",
  { "../_shared/employee-auth.ts": shared },
  { Deno },
).handleRequest;
const login = loadTs(
  "supabase/functions/employee-login/index.ts",
  { "../_shared/employee-auth.ts": shared },
  { Deno },
).handleRequest;
const request = (body, token = adminEmployee.auth_user_id) =>
  new Request("https://test.invalid", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const secret = randomUUID();
let employee;
await check(
  "Creation issues a unique code and Auth UUID with restricted defaults, ignoring submitted roles",
  async () => {
    const result = await manage(
      request({
        action: "create_employee",
        name: "Test employee",
        password: secret,
        role: "Super Admin",
        department: "Admin",
      }),
    );
    assert.equal(result.status, 200);
    employee = (await result.json()).employee;
    assert.equal(employee.employee_code, "EMP-0001");
    assert.equal(employee.role, "Employee");
    assert.equal(employee.department, "Unassigned");
    assert.equal(employee.data_scope, "Own");
    assert.equal(employee.dashboard_template, "Employee Home");
    assert.equal(employee.auth_login_email, "emp-0001@employee.mptourism.in");
    assert.ok(users.has(employee.auth_user_id));
    assert.ok(!JSON.stringify(employee).includes(secret));
    const concurrent = await Promise.all(
      ["A", "B"].map((name) =>
        manage(request({ action: "create_employee", name, password: secret })),
      ),
    );
    const codes = await Promise.all(
      concurrent.map(async (result) => (await result.json()).employeeCode),
    );
    assert.equal(new Set(codes).size, 2);
  },
);
await check(
  "Employee ID login normalizes input and returns only session tokens; failures are generic",
  async () => {
    const response = await login(request({ loginId: " emp-0001 ", password: secret }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(Object.keys(result), ["session"]);
    assert.equal(result.session.access_token, employee.auth_user_id);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    for (const loginId of ["EMP-0001", "EMP-9999", "malformed"]) {
      const result = await login(request({ loginId, password: randomUUID() }));
      assert.equal(result.status, 401);
      assert.deepEqual(await result.json(), { error: "Invalid Employee ID or password." });
    }
  },
);
await check("Regular and unlinked users cannot invoke any account-management action", async () => {
  const impostor = {
    id: randomUUID(),
    email: "admin@mptourism.in",
    user_metadata: { role: "admin" },
  };
  users.set(impostor.id, impostor);
  const count = mutations.length;
  for (const token of [employee.auth_user_id, impostor.id, "missing"])
    for (const action of [
      "create_employee",
      "edit_employee",
      "reset_password",
      "set_status",
      "delete_employee",
    ]) {
      assert.equal(
        (
          await manage(
            request(
              {
                action,
                employeeId: employee.id,
                name: "Attempt",
                password: secret,
                enabled: true,
                role: "Super Admin",
              },
              token,
            ),
          )
        ).status,
        403,
      );
    }
  assert.equal(mutations.length, count);
});
await check("Partial creation failure compensates by deleting its new Auth account", async () => {
  const count = users.size;
  failInsert = true;
  assert.equal(
    (
      await manage(
        request({ action: "create_employee", name: "Failure fixture", password: secret }),
      )
    ).status,
    400,
  );
  assert.equal(users.size, count);
  failInsert = false;
});
await check("Edit preserves identity; reset invalidates the old password", async () => {
  const edited = await manage(
    request({
      action: "edit_employee",
      employeeId: employee.id,
      name: "Renamed test",
      phone: "123",
      employee_code: "EMP-9999",
    }),
  );
  assert.equal(edited.status, 200);
  assert.equal(rows.get(employee.id).data.employee_code, employee.employee_code);
  const replacement = randomUUID();
  assert.equal(
    (
      await manage(
        request({ action: "reset_password", employeeId: employee.id, password: replacement }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await login(request({ loginId: employee.employee_code, password: secret }))).status,
    401,
  );
  assert.equal(
    (await login(request({ loginId: employee.employee_code, password: replacement }))).status,
    200,
  );
});
await check(
  "Disable blocks login, enable restores it, and the permanent administrator is protected",
  async () => {
    const password = passwords.get(employee.auth_user_id);
    assert.equal(
      (await manage(request({ action: "set_status", employeeId: employee.id, enabled: false })))
        .status,
      200,
    );
    assert.equal(rows.get(employee.id).data.active, false);
    assert.ok(banned.has(employee.auth_user_id));
    assert.equal((await login(request({ loginId: employee.employee_code, password }))).status, 401);
    assert.equal(
      (await manage(request({ action: "set_status", employeeId: employee.id, enabled: true })))
        .status,
      200,
    );
    assert.equal((await login(request({ loginId: employee.employee_code, password }))).status, 200);
    for (const action of ["delete_employee", "set_status"])
      assert.equal(
        (await manage(request({ action, employeeId: adminEmployee.id, enabled: false }))).status,
        403,
      );
  },
);
await check(
  "Deletion checks foreign keys, removes both identities, and preserves all business snapshots",
  async () => {
    foreignKeys = [{ table: "business_dependency" }];
    assert.equal(
      (await manage(request({ action: "delete_employee", employeeId: employee.id }))).status,
      409,
    );
    assert.ok(rows.has(employee.id));
    foreignKeys = [];
    assert.equal(
      (await manage(request({ action: "delete_employee", employeeId: employee.id }))).status,
      200,
    );
    assert.equal(rows.has(employee.id), false);
    assert.equal(users.has(employee.auth_user_id), false);
    assert.equal(
      (await login(request({ loginId: employee.employee_code, password: secret }))).status,
      401,
    );
    assert.equal(JSON.stringify(business), beforeBusiness);
  },
);
await check(
  "Cleanup plan keeps the administrator and unrelated Auth users, including legacy exact-email linkage",
  () => {
    const inventory = {
      employees: [
        { id: adminEmployee.id, data: adminEmployee },
        { id: "legacy", data: { email: "fixture@example.invalid" } },
      ],
      users: [
        users.get(adminEmployee.auth_user_id),
        { id: "legacy-user", email: "fixture@example.invalid" },
        { id: "unrelated", email: "other@example.invalid" },
      ],
    };
    const plan = resetPlan(inventory);
    assert.equal(plan.keep.id, adminEmployee.id);
    assert.deepEqual(
      plan.removedUsers.map((u) => u.id),
      ["legacy-user"],
    );
    assert.equal(plan.unrelatedUsers, 1);
  },
);

await check(
  "Cloud sync never merges or uploads stale employees, including realtime and employee-only sessions",
  async () => {
    let snapshot = {
      queries: [{ id: "local-query" }],
      tasks: [{ id: "local-task" }],
      events: [],
      employees: [adminEmployee, { id: "stale" }],
    };
    let remoteEmployees = [adminEmployee];
    const reads = [],
      writes = [],
      callbacks = {};
    let hydrated = 0,
      persisted;
    const fake = {
      from(table) {
        reads.push(table);
        let marker = false;
        const result = {
          select() {
            return result;
          },
          eq() {
            marker = true;
            return result;
          },
          order() {
            return result;
          },
          limit() {
            return result;
          },
          range() {
            return result;
          },
          maybeSingle() {
            return result;
          },
          upsert() {
            writes.push(table);
            return Promise.resolve({ error: null });
          },
          then(resolve, reject) {
            return Promise.resolve({
              error: null,
              data: marker
                ? { id: "marker" }
                : table === "crm_employees"
                  ? remoteEmployees.map((data) => ({ id: data.id, data }))
                  : [],
            }).then(resolve, reject);
          },
        };
        return result;
      },
      channel() {
        const channel = {
          on(_event, filter, callback) {
            callbacks[filter.table] = callback;
            return channel;
          },
          subscribe() {
            return channel;
          },
        };
        return channel;
      },
      removeChannel() {},
    };
    const remote = loadTs("src/lib/crm/crm-remote.ts", {
      "@/integrations/supabase/client": { supabase: fake },
      "@/lib/auth-mock": { auth: { current: () => ({ id: adminEmployee.auth_user_id }) } },
      "./store": {
        getCrmSnapshot: () => snapshot,
        listEmployees: () => snapshot.employees,
        hydrateCrm: (value) => {
          snapshot = value;
          hydrated++;
        },
        replaceEmployeesFromCloud: (employees) => {
          snapshot.employees = employees;
        },
        onCrmPersist: (callback) => {
          persisted = callback;
          return () => {};
        },
      },
      "./query-tracker-import.generated": { QUERY_TRACKER_MARKER_ID: "marker" },
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 400));
    const stop = remote.startCrmSync(true);
    await flush();
    assert.equal(hydrated, 1);
    assert.deepEqual(plain(snapshot.employees.map((e) => e.id)), [adminEmployee.id]);
    assert.equal(snapshot.queries.length, 1);
    assert.equal(snapshot.tasks.length, 1);
    assert.ok(writes.includes("crm_queries"));
    assert.ok(!writes.includes("crm_employees"));
    persisted({ ...snapshot, employees: [...snapshot.employees, { id: "stale-again" }] });
    await flush();
    assert.ok(!writes.includes("crm_employees"));
    remoteEmployees = [];
    callbacks.crm_employees();
    await flush();
    assert.equal(snapshot.employees.length, 0);
    stop();
    reads.length = 0;
    writes.length = 0;
    const stopEmployee = remote.startCrmSync(false);
    await flush();
    assert.deepEqual([...new Set(reads)], ["crm_employees"]);
    assert.equal(writes.length, 0);
    stopEmployee();
  },
);

console.log(
  `Account linkage audit passed: ${checks} behavioral test groups. No live Supabase writes performed.`,
);

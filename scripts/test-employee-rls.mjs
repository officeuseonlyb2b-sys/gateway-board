// Optional isolated PostgreSQL test; install PGlite under .employee-validation.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "../.employee-validation/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
let count = 0;
async function check(label, run) {
  await run();
  count++;
  console.log(`PASS ${label}`);
}
await db.exec(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub', auth.uid(), 'email', current_setting('request.jwt.claim.email', true)) $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT ALL ON auth.users TO service_role;
  CREATE PUBLICATION supabase_realtime;
`);
for (const migration of fs
  .readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`, "utf8"));
}
console.log("All repository migrations applied successfully in isolated PostgreSQL.");
const admin = randomUUID(),
  staff = randomUUID(),
  other = randomUUID(),
  unlinked = randomUUID();
for (const [id, email] of [
  [admin, "admin@mptourism.in"],
  [staff, "fixture@example.invalid"],
  [other, "other@example.invalid"],
  [unlinked, "admin@mptourism.in"],
]) {
  await db.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [id, email]);
}
const record = (id, role, code) => ({
  id,
  name: "Isolated test fixture",
  auth_user_id: id,
  employee_code: code,
  role,
  active: true,
  employee_status: "Active",
  account_status: "Active",
});
for (const data of [
  record(admin, "Super Admin", "ADMIN-001"),
  record(staff, "Employee", "EMP-0001"),
  record(other, "Employee", "EMP-0002"),
]) {
  await db.query("INSERT INTO public.crm_employees(id,data) VALUES ($1,$2)", [
    data.id,
    JSON.stringify(data),
  ]);
}
await db.exec(`INSERT INTO public.crm_queries(id,data) VALUES ('historical-query', '{"owner":"Historical owner","value":123}');
  INSERT INTO public.crm_tasks(id,data) VALUES ('historical-task', '{"owner":"Historical owner"}');
  INSERT INTO public.crm_events(id,data) VALUES ('historical-event', '{"by":"Historical actor"}');`);
async function asUser(id, fn, email = "admin@mptourism.in") {
  await db.query(
    "SELECT set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.email',$2,false)",
    [id, email],
  );
  await db.exec("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const rows = async (table) => (await db.query(`SELECT * FROM public.${table}`)).rows;
await check("Active linked Super Admin can read all employees and business rows", async () => {
  await asUser(admin, async () => {
    assert.equal((await rows("crm_employees")).length, 3);
    assert.equal((await rows("crm_queries")).length, 1);
  });
});
await check(
  "Employee sees only their own row and cannot read business tables, even with forged admin email",
  async () => {
    await asUser(staff, async () => {
      assert.deepEqual(
        (await rows("crm_employees")).map((row) => row.id),
        [staff],
      );
      for (const table of [
        "crm_queries",
        "crm_tasks",
        "crm_events",
        "destination_cities",
        "profiles",
        "user_roles",
      ])
        assert.equal((await rows(table)).length, 0, table);
      await assert.rejects(
        db.query("INSERT INTO public.crm_employees(id,data) VALUES ($1,$2)", [
          randomUUID(),
          JSON.stringify(record(randomUUID(), "Super Admin", "ADMIN-002")),
        ]),
        /row-level security/,
      );
      assert.equal(
        (
          await db.query(
            'UPDATE public.crm_employees SET data=data || \'{"role":"Super Admin"}\' WHERE id=$1 RETURNING id',
            [staff],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("DELETE FROM public.crm_employees WHERE id=$1 RETURNING id", [other])).rows
          .length,
        0,
      );
      await assert.rejects(db.query("SELECT public.next_employee_code()"), /permission denied/);
      await assert.rejects(
        db.query("SELECT public.employee_cleanup_foreign_keys()"),
        /permission denied/,
      );
    });
  },
);
await check("Unlinked Auth user and anonymous caller cannot read Employee Master", async () => {
  await asUser(unlinked, async () => {
    assert.equal((await rows("crm_employees")).length, 0);
    assert.equal((await rows("crm_queries")).length, 0);
  });
  await db.exec("SET ROLE anon");
  await assert.rejects(rows("crm_employees"), /permission denied/);
  await db.exec("RESET ROLE");
});
await check("Disable and delete revoke access without waiting for JWT expiration", async () => {
  await db.query(
    'UPDATE public.crm_employees SET data=data || \'{"active":false,"account_status":"Disabled"}\' WHERE id=$1',
    [staff],
  );
  await asUser(staff, async () => assert.equal((await rows("crm_employees")).length, 0));
  await db.query(
    'UPDATE public.crm_employees SET data=data || \'{"active":true,"account_status":"Active"}\' WHERE id=$1',
    [staff],
  );
  await asUser(staff, async () => assert.equal((await rows("crm_employees")).length, 1));
  await db.query("DELETE FROM public.crm_employees WHERE id=$1", [other]);
  await asUser(other, async () => assert.equal((await rows("crm_employees")).length, 0));
});
await check(
  "Employee IDs and Auth linkage are unique; codes are immutable; last administrator is protected",
  async () => {
    await assert.rejects(
      db.query("INSERT INTO public.crm_employees(id,data) VALUES ($1,$2)", [
        randomUUID(),
        JSON.stringify(record(randomUUID(), "Employee", "EMP-0001")),
      ]),
      /duplicate key/,
    );
    await assert.rejects(
      db.query("INSERT INTO public.crm_employees(id,data) VALUES ($1,$2)", [
        randomUUID(),
        JSON.stringify(record(staff, "Employee", "EMP-0999")),
      ]),
      /duplicate key/,
    );
    await assert.rejects(
      db.query(
        'UPDATE public.crm_employees SET data=data || \'{"employee_code":"EMP-0999"}\' WHERE id=$1',
        [staff],
      ),
      /immutable/,
    );
    await asUser(admin, async () => {
      await assert.rejects(
        db.query("DELETE FROM public.crm_employees WHERE id=$1", [admin]),
        /cannot be deleted/,
      );
      await assert.rejects(
        db.query("UPDATE public.crm_employees SET data=data || '{\"active\":false}' WHERE id=$1", [
          admin,
        ]),
        /cannot be disabled/,
      );
    });
  },
);
await check("Sequence stays unique beyond four digits and is server-only", async () => {
  await db.exec("SET ROLE service_role");
  const values = await Promise.all(
    Array.from({ length: 8 }, () => db.query("SELECT public.next_employee_code() AS code")),
  );
  assert.equal(new Set(values.map((result) => result.rows[0].code)).size, 8);
  await db.query("SELECT setval('public.crm_employee_code_seq', 10000, false)");
  assert.equal(
    (await db.query("SELECT public.next_employee_code() AS code")).rows[0].code,
    "EMP-10000",
  );
  await db.exec("RESET ROLE");
});
await check(
  "Foreign-key preflight detects indirect business cascades and leaves historical data unchanged",
  async () => {
    assert.deepEqual(
      (await db.query("SELECT public.employee_cleanup_foreign_keys() AS links")).rows[0].links,
      [],
    );
    await db.exec(
      "CREATE TABLE public.dangerous_business_fixture(id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE)",
    );
    const found = (await db.query("SELECT public.employee_cleanup_foreign_keys() AS links")).rows[0]
      .links;
    assert.equal(found.length, 1);
    assert.equal(found[0].table, "public.dangerous_business_fixture");
    await db.exec("DROP TABLE public.dangerous_business_fixture");
    assert.equal((await rows("crm_queries"))[0].data.owner, "Historical owner");
    assert.equal((await rows("crm_tasks"))[0].data.owner, "Historical owner");
    assert.equal((await rows("crm_events"))[0].data.by, "Historical actor");
  },
);
await check(
  "Sales roles read the same costing masters and cannot write them or Queries",
  async () => {
    await db.query(
      'INSERT INTO public.app_master_state(id, data) VALUES (\'shared\', \'{"destination_cities":[{"id":"dc1"}]}\')',
    );
    await db.query(
      "INSERT INTO public.destination_cities(id, name) VALUES ('dc-shared', 'Bhopal')",
    );
    await db.query(
      "INSERT INTO public.destination_tours(id, city_id, title) VALUES ('dt-shared', 'dc-shared', 'Fort')",
    );
    const sales = [
      ["Sales Manager", "EMP-0101"],
      ["Senior Sales Executive", "EMP-0102"],
      ["Sales Executive", "EMP-0103"],
    ];
    for (const [role, code] of sales) {
      const id = randomUUID();
      await db.query("INSERT INTO auth.users(id, email) VALUES ($1, $2)", [
        id,
        `${code}@example.invalid`,
      ]);
      await db.query("INSERT INTO public.crm_employees(id, data) VALUES ($1, $2)", [
        id,
        JSON.stringify(record(id, role, code)),
      ]);
      await asUser(
        id,
        async () => {
          assert.equal((await rows("app_master_state")).length, 1, role);
          assert.equal((await rows("destination_cities")).length, 1, role);
          assert.equal((await rows("destination_tours")).length, 1, role);
          assert.equal((await rows("crm_queries")).length, 0, role);
          assert.equal(
            (await db.query("UPDATE public.app_master_state SET rev='sales-write' RETURNING id"))
              .rows.length,
            0,
            role,
          );
          await assert.rejects(
            db.query(
              "INSERT INTO public.destination_cities(id, name) VALUES ('dc-sales', 'Denied')",
            ),
            /row-level security/,
          );
        },
        `${code}@example.invalid`,
      );
    }
    await asUser(admin, async () => {
      assert.equal((await rows("app_master_state")).length, 1);
      assert.equal((await rows("destination_cities")).length, 1);
      assert.equal(
        (
          await db.query(
            "UPDATE public.app_master_state SET rev='admin-ok' WHERE id='shared' RETURNING id",
          )
        ).rows.length,
        1,
      );
    });
    await asUser(staff, async () => {
      assert.equal((await rows("app_master_state")).length, 0);
      assert.equal((await rows("destination_cities")).length, 0);
    });
  },
);
await db.close();
console.log(
  `PostgreSQL employee security tests passed: ${count} test groups. No live Supabase writes performed.`,
);

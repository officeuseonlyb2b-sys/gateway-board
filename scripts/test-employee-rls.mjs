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
const salesIds = [];
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
await check(
  "Disable and delete revoke business access while preserving self-status diagnostics",
  async () => {
    await db.query(
      'UPDATE public.crm_employees SET data=data || \'{"active":false,"account_status":"Disabled"}\' WHERE id=$1',
      [staff],
    );
    await asUser(staff, async () => {
      assert.equal(
        (await rows("crm_employees")).length,
        1,
        "The self row remains readable so login can report Disabled instead of a false linkage error",
      );
      assert.equal(
        (await rows("crm_queries")).length,
        0,
        "Disabled employees lose business access",
      );
    });
    await db.query(
      'UPDATE public.crm_employees SET data=data || \'{"active":true,"account_status":"Active"}\' WHERE id=$1',
      [staff],
    );
    await asUser(staff, async () => assert.equal((await rows("crm_employees")).length, 1));
    await db.query("DELETE FROM public.crm_employees WHERE id=$1", [other]);
    await asUser(other, async () => assert.equal((await rows("crm_employees")).length, 0));
  },
);
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
      ["Sales Manager", "EMP-0101", "Deeksha Saini"],
      ["Senior Sales Executive", "EMP-0102", "Chhaya Prajapati"],
      ["Sales Executive", "EMP-0103", "Bhumika Prajapati"],
    ];
    for (const [role, code, name] of sales) {
      const id = randomUUID();
      salesIds.push(id);
      await db.query("INSERT INTO auth.users(id, email) VALUES ($1, $2)", [
        id,
        `${code}@example.invalid`,
      ]);
      await db.query("INSERT INTO public.crm_employees(id, data) VALUES ($1, $2)", [
        id,
        JSON.stringify({
          ...record(id, role, code),
          name,
          department: "Sales",
          unit: "Madhya Pradesh",
        }),
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
await check("Sales Manager assignment directory is safe and same-unit only", async () => {
  const additionalEmployees = [
    [randomUUID(), "Sales Head", "Madhya Pradesh Unit", true, "Active", "Active"],
    [randomUUID(), "Sales Executive", "Rajasthan", true, "Active", "Active"],
    [randomUUID(), "Sales Executive", "MP", true, "Active", "Exited"],
    [randomUUID(), "Sales Executive", "MP", false, "Disabled", "Inactive"],
    [randomUUID(), "Product Executive", "MP", true, "Active", "Active"],
  ];
  for (const [id, role, unit, active, accountStatus, employeeStatus] of additionalEmployees) {
    await db.query("INSERT INTO auth.users(id, email) VALUES ($1, $2)", [
      id,
      `${id}@example.invalid`,
    ]);
    await db.query("INSERT INTO public.crm_employees(id, data) VALUES ($1, $2)", [
      id,
      JSON.stringify({
        ...record(id, role, `EMP-${id.slice(0, 6)}`),
        name: `${role} ${unit}`,
        unit,
        department: role === "Product Executive" ? "Product" : "Sales",
        active,
        account_status: accountStatus,
        employee_status: employeeStatus,
      }),
    ]);
  }
  const [salesHeadId] = additionalEmployees[0];
  await asUser(salesIds[0], async () => {
    const result = await db.query(
      "SELECT employee_id, role, auth_user_id FROM public.list_sales_assignment_candidates()",
    );
    const ids = result.rows.map((row) => row.employee_id).sort();
    assert.deepEqual(ids, [salesIds[0], salesIds[1], salesIds[2], salesHeadId].sort());
    assert.ok(
      result.rows.every((row) => row.auth_user_id),
      "safe ownership link is present",
    );
  });
  await asUser(salesIds[2], async () => {
    assert.equal(
      (await db.query("SELECT * FROM public.list_sales_assignment_candidates()")).rows.length,
      0,
    );
  });
  await asUser(unlinked, async () => {
    assert.equal(
      (await db.query("SELECT * FROM public.list_sales_assignment_candidates()")).rows.length,
      0,
    );
  });
  await db.exec("SET ROLE anon");
  await assert.rejects(
    db.query("SELECT * FROM public.list_sales_assignment_candidates()"),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
});

await check(
  "Sales roles create their own unassigned Query using stable Employee identity",
  async () => {
    for (const [index, employeeId] of salesIds.entries()) {
      const rowId = `unassigned-create-${index}`;
      const queryId = `Q-UNASSIGNED-${index}`;
      const data = {
        id: rowId,
        query_id: queryId,
        owner: "",
        created_by: employeeId,
        assignment_status: "Awaiting Assignment",
        primary_unit: "Madhya Pradesh",
        participating_units: ["Madhya Pradesh"],
      };
      await asUser(
        employeeId,
        async () => {
          const identity = (
            await db.query(
              `SELECT auth.uid() AS auth_uid,
                      public.current_crm_employee_id() AS employee_id,
                      public.can_create_crm_query($1::jsonb, NULL) AS can_create`,
              [JSON.stringify(data)],
            )
          ).rows[0];
          assert.equal(identity.auth_uid, employeeId);
          assert.equal(identity.employee_id, employeeId);
          assert.equal(identity.can_create, true);
          const result = await db.query(
            `INSERT INTO public.crm_queries(id, query_id, owner, owner_user_id, data)
             VALUES ($1,$2,'',NULL,$3::jsonb)
             RETURNING owner, owner_user_id, data`,
            [rowId, queryId, JSON.stringify(data)],
          );
          assert.equal(result.rows.length, 1);
          assert.equal(result.rows[0].owner, "");
          assert.equal(result.rows[0].owner_user_id, null);
          assert.equal(result.rows[0].data.created_by, employeeId);
        },
        `EMP-010${index + 1}@example.invalid`,
      );
      const persisted = (
        await db.query(
          `SELECT owner, owner_user_id, data
           FROM public.crm_queries WHERE query_id = $1`,
          [queryId],
        )
      ).rows[0];
      assert.equal(persisted.owner, "");
      assert.equal(persisted.owner_user_id, null);
      assert.equal(persisted.data.created_by, employeeId);
    }

    await asUser(
      salesIds[2],
      async () => {
        const ownRows = await db.query(
          "SELECT query_id FROM public.crm_queries WHERE query_id = 'Q-UNASSIGNED-2'",
        );
        assert.equal(ownRows.rows.length, 1);
        const otherRows = await db.query(
          "SELECT query_id FROM public.crm_queries WHERE query_id = 'Q-UNASSIGNED-1'",
        );
        assert.equal(otherRows.rows.length, 0);

        const upsertData = {
          id: "unassigned-create-2",
          query_id: "Q-UNASSIGNED-2",
          owner: "",
          created_by: salesIds[2],
          assignment_status: "Awaiting Assignment",
          primary_unit: "Madhya Pradesh",
          participating_units: ["Madhya Pradesh"],
          api_upsert_verified: true,
        };
        const upsert = await db.query(
          `INSERT INTO public.crm_queries(id, query_id, owner, owner_user_id, data)
           VALUES ($1,$2,'',NULL,$3::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             query_id = EXCLUDED.query_id,
             owner = EXCLUDED.owner,
             owner_user_id = EXCLUDED.owner_user_id,
             data = EXCLUDED.data
           RETURNING owner_user_id, data`,
          [upsertData.id, upsertData.query_id, JSON.stringify(upsertData)],
        );
        assert.equal(upsert.rows.length, 1);
        assert.equal(upsert.rows[0].owner_user_id, null);
        assert.equal(upsert.rows[0].data.api_upsert_verified, true);
      },
      "EMP-0103@example.invalid",
    );

    await asUser(
      salesIds[0],
      async () => {
        const assignedData = {
          id: "unassigned-create-2",
          query_id: "Q-UNASSIGNED-2",
          owner: salesIds[2],
          created_by: salesIds[2],
          assignment_status: "Assigned",
          assigned_by: salesIds[0],
          assigned_at: "2026-10-22T12:00:00.000Z",
          assignment_history: [
            {
              assigned_from: "",
              assigned_to: salesIds[2],
              assigned_by: salesIds[0],
              assigned_at: "2026-10-22T12:00:00.000Z",
            },
          ],
          primary_unit: "Madhya Pradesh",
          participating_units: ["Madhya Pradesh"],
          api_upsert_verified: true,
        };
        const assigned = await db.query(
          `UPDATE public.crm_queries
           SET owner = $1::text, owner_user_id = $1::uuid, data = $2::jsonb
           WHERE id = 'unassigned-create-2'
           RETURNING owner_user_id, data`,
          [salesIds[2], JSON.stringify(assignedData)],
        );
        assert.equal(assigned.rows.length, 1);
        assert.equal(assigned.rows[0].owner_user_id, salesIds[2]);
        assert.equal(assigned.rows[0].data.assignment_status, "Assigned");

        const selfAssignedData = {
          id: "unassigned-create-0",
          query_id: "Q-UNASSIGNED-0",
          owner: salesIds[0],
          created_by: salesIds[0],
          assignment_status: "Assigned",
          assigned_by: salesIds[0],
          assigned_at: "2026-10-24T12:00:00.000Z",
          assignment_history: [
            {
              assigned_from: "",
              assigned_to: salesIds[0],
              assigned_by: salesIds[0],
              assigned_at: "2026-10-24T12:00:00.000Z",
            },
          ],
          primary_unit: "Madhya Pradesh",
          participating_units: ["Madhya Pradesh"],
        };
        const selfAssigned = await db.query(
          `UPDATE public.crm_queries
           SET owner = $1::text, owner_user_id = $1::uuid, data = $2::jsonb
           WHERE id = 'unassigned-create-0'
           RETURNING owner_user_id, data`,
          [salesIds[0], JSON.stringify(selfAssignedData)],
        );
        assert.equal(selfAssigned.rows.length, 1);
        assert.equal(selfAssigned.rows[0].owner_user_id, salesIds[0]);
        assert.equal(selfAssigned.rows[0].data.assignment_status, "Assigned");
      },
      "EMP-0101@example.invalid",
    );

    // Regression coverage for the exact targeted UPDATE used by Assignment
    // Desk: same-unit manager assignments succeed; unsafe targets and a Sales
    // Executive attempting the manager action remain denied.
    const crossUnitId = (
      await db.query(
        "SELECT id FROM public.crm_employees WHERE data ->> 'unit' = 'Rajasthan' LIMIT 1",
      )
    ).rows[0].id;
    const exitedId = (
      await db.query(
        "SELECT id FROM public.crm_employees WHERE data ->> 'employee_status' = 'Exited' LIMIT 1",
      )
    ).rows[0].id;
    const assignmentPayload = (id, queryId, owner) => ({
      id,
      query_id: queryId,
      owner,
      created_by: salesIds[1],
      assignment_status: "Assigned",
      assigned_by: salesIds[0],
      assigned_at: "2026-10-24T12:30:00.000Z",
      assignment_history: [
        { assigned_to: owner, assigned_by: salesIds[0], assigned_at: "2026-10-24T12:30:00.000Z" },
      ],
      primary_unit: "Madhya Pradesh",
      participating_units: ["Madhya Pradesh"],
    });
    await asUser(salesIds[0], async () => {
      // Deeksha -> Chhaya: the second same-unit eligible Sales role.
      const chhayaRow = (
        await db.query("SELECT data FROM public.crm_queries WHERE id='unassigned-create-1'")
      ).rows[0];
      const chhayaData = {
        ...chhayaRow.data,
        owner: salesIds[1],
        assignment_status: "Assigned",
        assigned_by: salesIds[0],
        assigned_at: "2026-10-24T12:29:00.000Z",
        assigned_on: "2026-10-24T12:29:00.000Z",
        assignment_history: [
          ...(chhayaRow.data.assignment_history || []),
          {
            assigned_to: salesIds[1],
            assigned_by: salesIds[0],
            assigned_at: "2026-10-24T12:29:00.000Z",
          },
        ],
      };
      const chhayaAssignment = await db.query(
        "UPDATE public.crm_queries SET owner=$1::text, owner_user_id=$1::uuid, data=$2::jsonb WHERE id='unassigned-create-1' RETURNING owner, owner_user_id, data",
        [salesIds[1], JSON.stringify(chhayaData)],
      );
      assert.equal(chhayaAssignment.rows[0].owner, salesIds[1]);
      assert.equal(chhayaAssignment.rows[0].owner_user_id, salesIds[1]);
      assert.equal(chhayaAssignment.rows[0].data.assignment_status, "Assigned");
      await assert.rejects(
        db.query(
          "UPDATE public.crm_queries SET owner=$1::text, owner_user_id=$1::uuid, data=$2::jsonb WHERE id='unassigned-create-1'",
          [
            crossUnitId,
            JSON.stringify(assignmentPayload("unassigned-create-1", "Q-UNASSIGNED-1", crossUnitId)),
          ],
        ),
        /active Sales employee in your unit/,
      );
      await assert.rejects(
        db.query(
          "UPDATE public.crm_queries SET owner=$1::text, owner_user_id=$1::uuid, data=$2::jsonb WHERE id='unassigned-create-1'",
          [
            exitedId,
            JSON.stringify(assignmentPayload("unassigned-create-1", "Q-UNASSIGNED-1", exitedId)),
          ],
        ),
        /active Sales employee in your unit/,
      );
    });
    await asUser(salesIds[2], async () => {
      const row = (
        await db.query("SELECT data FROM public.crm_queries WHERE id='unassigned-create-2'")
      ).rows[0];
      const attempted = {
        ...row.data,
        owner: salesIds[1],
        assigned_by: salesIds[2],
        assigned_at: "2026-10-24T12:31:00.000Z",
        assignment_history: [
          ...row.data.assignment_history,
          {
            assigned_from: salesIds[2],
            assigned_to: salesIds[1],
            assigned_by: salesIds[2],
            assigned_at: "2026-10-24T12:31:00.000Z",
          },
        ],
      };
      await assert.rejects(
        db.query(
          "UPDATE public.crm_queries SET owner=$1::text, owner_user_id=$1::uuid, data=$2::jsonb WHERE id='unassigned-create-2'",
          [salesIds[1], JSON.stringify(attempted)],
        ),
        /authorized Sales Manager/,
      );
    });

    const forgedData = {
      id: "forged-unassigned-create",
      query_id: "Q-FORGED-UNASSIGNED",
      owner: "",
      created_by: salesIds[2],
      assignment_status: "Awaiting Assignment",
      primary_unit: "Madhya Pradesh",
      participating_units: ["Madhya Pradesh"],
    };
    await asUser(
      salesIds[1],
      async () => {
        assert.equal(
          (
            await db.query("SELECT public.can_create_crm_query($1::jsonb, NULL) AS allowed", [
              JSON.stringify(forgedData),
            ])
          ).rows[0].allowed,
          false,
        );
        await assert.rejects(
          db.query(
            `INSERT INTO public.crm_queries(id, query_id, owner, owner_user_id, data)
             VALUES ($1,$2,'',NULL,$3::jsonb)`,
            [forgedData.id, forgedData.query_id, JSON.stringify(forgedData)],
          ),
          /row-level security/,
        );
      },
      "EMP-0102@example.invalid",
    );
    await asUser(unlinked, async () => {
      assert.equal(
        (
          await db.query("SELECT public.can_create_crm_query($1::jsonb, NULL) AS allowed", [
            JSON.stringify({ ...forgedData, id: "unlinked-create", created_by: unlinked }),
          ])
        ).rows[0].allowed,
        false,
      );
      await assert.rejects(
        db.query(
          `INSERT INTO public.crm_queries(id, query_id, owner, owner_user_id, data)
           VALUES ('unlinked-create','Q-UNLINKED','',NULL,$1::jsonb)`,
          [JSON.stringify({ ...forgedData, id: "unlinked-create", created_by: unlinked })],
        ),
        /row-level security/,
      );
    });
  },
);
await check(
  "Quotation versions allocate atomically per Query, preserve snapshots and retry idempotently",
  async () => {
    const ownerId = salesIds[2];
    const queryRowId = randomUUID();
    await db.query(
      `INSERT INTO public.crm_queries(id, query_id, owner, owner_user_id, data)
     VALUES ($1, 'Q-VERSION-TEST', $2, $3, $4)`,
      [
        queryRowId,
        ownerId,
        ownerId,
        JSON.stringify({
          id: queryRowId,
          query_id: "Q-VERSION-TEST",
          owner: ownerId,
          costing_versions: [],
          quotation_drafts: [],
        }),
      ],
    );
    await asUser(
      ownerId,
      async () => {
        const save = async (id, family, amount, draftId = null) =>
          (
            await db.query(
              "SELECT public.finalize_crm_quotation_version($1, $2::jsonb, $3) AS data",
              [
                "Q-VERSION-TEST",
                JSON.stringify({ id, family_id: family, totals: { amount } }),
                draftId,
              ],
            )
          ).rows[0].data;
        const first = await save("quote-a-v1", "family-a", 100, "draft-a-v1");
        const retry = await save("quote-a-v1-retry", "family-a", 999, "draft-a-v1");
        const second = await save("quote-a-v2", "family-a", 200);
        const alternate = await save("quote-b-v1", "family-b", 300);
        assert.equal(first.costing_versions.length, 1);
        assert.equal(retry.costing_versions.length, 1);
        assert.equal(retry.costing_versions[0].quote.totals.amount, 100);
        assert.deepEqual(
          second.costing_versions.map((version) => version.version),
          [1, 2],
        );
        assert.equal(second.costing_versions[0].quote.totals.amount, 100);
        assert.equal(second.costing_versions[1].quote.totals.amount, 200);
        assert.equal(alternate.costing_versions[2].version, 3);
        assert.equal(alternate.costing_versions[2].quote.family_id, "family-b");
        assert.equal(alternate.costing_versions[2].quote.prepared_by_employee_id, ownerId);
      },
      "EMP-0103@example.invalid",
    );
  },
);
await check(
  "Draft review snapshots grant the selected reviewer access without creating V1",
  async () => {
    const ownerId = salesIds[2];
    const reviewerId = salesIds[1];
    await asUser(
      ownerId,
      async () => {
        const row = (
          await db.query("SELECT data FROM public.crm_queries WHERE query_id='Q-VERSION-TEST'")
        ).rows[0];
        const draft = {
          id: "draft-review-1",
          query_id: "Q-VERSION-TEST",
          updated_at: new Date().toISOString(),
          latest_review_snapshot_at: new Date().toISOString(),
          latest_review_snapshot_hash: "HASH-1",
        };
        const review = {
          id: "draft-review-request-1",
          reviewer_employee_id: reviewerId,
          requested_by_employee_id: ownerId,
          requested_at: new Date().toISOString(),
          status: "Requested",
          source_type: "draft",
          draft_id: draft.id,
          draft_snapshot_hash: "HASH-1",
          quotation_snapshot: { version: 0, quote: { id: "snapshot-1", totals: { amount: 444 } } },
          checklist: [],
        };
        const next = {
          ...row.data,
          quotation_drafts: [draft],
          review_support: { query_reviews: [review], quotation_reviews: [], assistance: [] },
        };
        const updated = await db.query(
          "UPDATE public.crm_queries SET data=$1::jsonb WHERE query_id='Q-VERSION-TEST' RETURNING data",
          [JSON.stringify(next)],
        );
        assert.equal(updated.rows.length, 1);
        assert.equal(
          updated.rows[0].data.costing_versions.length,
          3,
          "draft review must not create V1",
        );
        const edited = {
          ...updated.rows[0].data,
          quotation_drafts: [{ ...draft, updated_at: new Date(Date.now() + 1000).toISOString() }],
        };
        const afterEdit = await db.query(
          "UPDATE public.crm_queries SET data=$1::jsonb WHERE query_id='Q-VERSION-TEST' RETURNING data",
          [JSON.stringify(edited)],
        );
        assert.equal(
          afterEdit.rows[0].data.review_support.query_reviews[0].quotation_snapshot.quote.totals
            .amount,
          444,
          "editing the live draft must not mutate its prior review snapshot",
        );
      },
      "EMP-0103@example.invalid",
    );
    await asUser(
      reviewerId,
      async () => {
        const visible = await db.query(
          "SELECT data FROM public.crm_queries WHERE query_id='Q-VERSION-TEST'",
        );
        assert.equal(visible.rows.length, 1);
        assert.equal(
          visible.rows[0].data.review_support.query_reviews[0].quotation_snapshot.quote.totals
            .amount,
          444,
        );
        const inReview = {
          ...visible.rows[0].data.review_support.query_reviews[0],
          status: "In Review",
          started_at: new Date().toISOString(),
        };
        const returned = {
          ...inReview,
          status: "Returned",
          completed_at: new Date().toISOString(),
          decided_at: new Date().toISOString(),
          decision_note: "Please correct hotel rates and verify room validity.",
          review_notes: "Please correct hotel rates and verify room validity.",
        };
        const reviewData = {
          ...visible.rows[0].data,
          review_support: {
            ...visible.rows[0].data.review_support,
            query_reviews: [inReview],
          },
        };
        await db.query(
          "UPDATE public.crm_queries SET data=$1::jsonb WHERE query_id='Q-VERSION-TEST'",
          [JSON.stringify(reviewData)],
        );
        reviewData.review_support.query_reviews = [returned];
        await db.query(
          "UPDATE public.crm_queries SET data=$1::jsonb WHERE query_id='Q-VERSION-TEST'",
          [JSON.stringify(reviewData)],
        );
      },
      "EMP-0102@example.invalid",
    );
    await asUser(
      ownerId,
      async () => {
        const visible = await db.query(
          "SELECT data FROM public.crm_queries WHERE query_id='Q-VERSION-TEST'",
        );
        const review = visible.rows[0].data.review_support.query_reviews[0];
        assert.equal(review.status, "Returned");
        assert.equal(review.decision_note, "Please correct hotel rates and verify room validity.");
        assert.equal(
          review.quotation_snapshot.quote.totals.amount,
          444,
          "return feedback must not mutate the submitted immutable snapshot",
        );
      },
      "EMP-0103@example.invalid",
    );
  },
);
await check(
  "Standalone quotation review grants only explicit snapshot access and does not require a Query",
  async () => {
    const requesterId = salesIds[2];
    const reviewerId = salesIds[1];
    await db.query(
      "UPDATE public.crm_employees SET data=jsonb_set(data, '{unit}', '\"\"') WHERE id=$1",
      [reviewerId],
    );
    await asUser(
      requesterId,
      async () => {
        const directory = await db.query("SELECT * FROM public.crm_review_employee_directory()");
        assert.ok(
          directory.rows.some((employee) => employee.id === reviewerId),
          "eligible reviewer must remain visible when unit metadata differs",
        );
        assert.deepEqual(
          directory.rows
            .filter((employee) => ["Chhaya Prajapati", "Deeksha Saini"].includes(employee.name))
            .map((employee) => employee.name)
            .sort(),
          ["Chhaya Prajapati", "Deeksha Saini"],
        );
        const data = {
          id: "standalone-review-1",
          source_type: "standalone_draft",
          query_id: null,
          draft_id: "standalone-draft-1",
          draft_name: "MP Tour Costing",
          created_by_employee_id: requesterId,
          requested_by_employee_id: requesterId,
          reviewer_employee_id: reviewerId,
          assigned_to_employee_id: reviewerId,
          status: "Requested",
          quotation_snapshot: {
            version: 0,
            prepared_by_employee_id: requesterId,
            quote: { id: "standalone-snapshot", total: 765 },
          },
        };
        await db.query(
          `INSERT INTO public.crm_standalone_quotation_reviews
           (id, requester_employee_id, reviewer_employee_id, creator_employee_id,
            prepared_by_employee_id, assigned_to_employee_id, draft_id, snapshot_id,
            status, reason, snapshot, data)
           VALUES ($1,$2,$3,$4,$4,$3,'standalone-draft-1','standalone-snapshot',
             'Requested','Please verify final costing.',$5::jsonb,$6::jsonb)`,
          [
            "standalone-review-1",
            requesterId,
            reviewerId,
            requesterId,
            JSON.stringify(data.quotation_snapshot),
            JSON.stringify(data),
          ],
        );
        assert.equal((await rows("crm_standalone_quotation_reviews")).length, 1);
      },
      "EMP-0103@example.invalid",
    );
    await asUser(
      reviewerId,
      async () => {
        const visible = await rows("crm_standalone_quotation_reviews");
        assert.equal(visible.length, 1);
        assert.equal(visible[0].data.quotation_snapshot.quote.total, 765);
        const next = { ...visible[0].data, status: "In Review" };
        assert.equal(
          (
            await db.query(
              "UPDATE public.crm_standalone_quotation_reviews SET status='In Review', data=$1::jsonb WHERE id='standalone-review-1' RETURNING id",
              [JSON.stringify(next)],
            )
          ).rows.length,
          1,
        );
        const tampered = {
          ...next,
          quotation_snapshot: { version: 0, quote: { id: "standalone-snapshot", total: 1 } },
        };
        await assert.rejects(
          db.query(
            "UPDATE public.crm_standalone_quotation_reviews SET data=$1::jsonb WHERE id='standalone-review-1'",
            [JSON.stringify(tampered)],
          ),
          /immutable/,
        );
      },
      "EMP-0102@example.invalid",
    );
    await asUser(
      other,
      async () => {
        assert.equal((await rows("crm_standalone_quotation_reviews")).length, 0);
      },
      "other@example.invalid",
    );
    await asUser(admin, async () => {
      assert.equal((await rows("crm_standalone_quotation_reviews")).length, 1);
    });
  },
);
await db.close();
console.log(
  `PostgreSQL employee security tests passed: ${count} test groups. No live Supabase writes performed.`,
);

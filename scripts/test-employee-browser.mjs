// Browser integration fixtures are intercepted locally; never contact live Supabase.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "../.employee-validation/node_modules/playwright-core/index.mjs";

const base = process.env.EMPLOYEE_TEST_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const hydrationWarnings = [];
const favicon404s = [];
const adminId = randomUUID(),
  adminRowId = randomUUID();
const adminPassword = randomUUID();
const rows = [
  {
    id: adminRowId,
    data: {
      id: adminRowId,
      name: "Super Admin",
      email: "admin@mptourism.in",
      employee_code: "ADMIN-001",
      auth_user_id: adminId,
      role: "Super Admin",
      active: true,
      account_status: "Active",
      employee_status: "Active",
      joined_at: new Date().toISOString(),
    },
  },
];
const passwords = new Map([[adminId, adminPassword]]);
const banned = new Set();
let sequence = 0;
const user = (id) => ({
  id,
  email:
    id === adminId
      ? "admin@mptourism.in"
      : `${rows.find((row) => row.data.auth_user_id === id)?.data.employee_code.toLowerCase()}@employee.mptourism.in`,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
});
const jwt = (id) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated" })).toString("base64url")}.${Buffer.from("test-signature").toString("base64url")}`;
const session = (id) => ({
  access_token: jwt(id),
  refresh_token: randomUUID(),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: user(id),
});
function caller(request) {
  try {
    return JSON.parse(
      Buffer.from(request.headers().authorization?.split(".")[1] || "", "base64url").toString(),
    ).sub;
  } catch {
    return null;
  }
}
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.origin === new URL(base).origin) return route.continue();
  if (!url.hostname.endsWith(".supabase.co")) return route.abort();
  const respond = (data, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  const id = caller(request);
  const body = request.postData() ? request.postDataJSON() : {};
  if (url.pathname === "/auth/v1/token") {
    if (body.email !== "admin@mptourism.in" || body.password !== adminPassword)
      return respond({ msg: "Invalid credentials" }, 400);
    return respond(session(adminId));
  }
  if (url.pathname === "/auth/v1/user") return respond(user(id));
  if (url.pathname === "/auth/v1/logout") return respond({});
  if (url.pathname === "/functions/v1/employee-login") {
    const row = rows.find((row) => row.data.employee_code === body.loginId.trim().toUpperCase());
    if (
      !row ||
      !row.data.active ||
      row.data.account_status !== "Active" ||
      banned.has(row.data.auth_user_id) ||
      passwords.get(row.data.auth_user_id) !== body.password
    )
      return respond({ error: "Invalid Employee ID or password." }, 401);
    return respond({ session: session(row.data.auth_user_id) });
  }
  if (url.pathname === "/functions/v1/manage-employee-account") {
    if (id !== adminId) return respond({ error: "Forbidden" }, 403);
    if (body.action === "create_employee") {
      const code = `EMP-${String(++sequence).padStart(4, "0")}`,
        employeeId = randomUUID(),
        authId = randomUUID();
      const employee = {
        id: employeeId,
        auth_user_id: authId,
        name: body.name,
        phone: body.phone,
        employee_code: code,
        role: "Employee",
        active: true,
        account_status: "Active",
        employee_status: "Active",
        joined_at: new Date().toISOString(),
      };
      rows.push({ id: employeeId, data: employee });
      passwords.set(authId, body.password);
      return respond({ employee, employeeCode: code });
    }
    const row = rows.find((item) => item.id === body.employeeId);
    if (!row) return respond({ error: "Employee not found." }, 404);
    if (body.action === "reset_password") {
      passwords.set(row.data.auth_user_id, body.password);
      return respond({ ok: true });
    }
    if (body.action === "set_status") {
      row.data.active = body.enabled;
      row.data.account_status = body.enabled ? "Active" : "Disabled";
      if (body.enabled) banned.delete(row.data.auth_user_id);
      else banned.add(row.data.auth_user_id);
      return respond({ employee: row.data });
    }
    if (body.action === "delete_employee") {
      rows.splice(rows.indexOf(row), 1);
      passwords.delete(row.data.auth_user_id);
      banned.add(row.data.auth_user_id);
      return respond({ ok: true });
    }
    return respond({ error: "Unexpected test action" }, 400);
  }
  if (url.pathname === "/rest/v1/crm_employees") {
    let visible = rows.filter(
      (row) => id === adminId || (row.data.auth_user_id === id && row.data.active),
    );
    const filter = url.searchParams.get("data->>auth_user_id");
    if (filter) visible = visible.filter((row) => row.data.auth_user_id === filter.slice(3));
    return respond(visible);
  }
  if (url.pathname === "/rest/v1/crm_events" && url.searchParams.has("id"))
    return respond([{ id: url.searchParams.get("id").slice(3) }]);
  if (url.pathname.startsWith("/rest/v1/")) return respond([]);
  return respond({});
});
const page = await context.newPage();
function recordBrowserError(message) {
  if (message.includes("Hydration failed")) hydrationWarnings.push(message);
  else errors.push(message);
}
page.on("pageerror", (error) => recordBrowserError(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && message.text().includes("Hydration failed"))
    recordBrowserError(message.text());
});
page.on("response", (response) => {
  if (response.url().endsWith("/favicon.ico") && response.status() === 404)
    favicon404s.push(response.url());
});
const employeePassword = randomUUID();
const replacementPassword = randomUUID();
let count = 0;
async function check(label, run) {
  await run();
  count++;
  console.log(`PASS ${label}`);
}
async function waitForLoginReady() {
  await page.getByLabel("Employee ID / Admin Email").waitFor();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("form")].some((form) =>
        Object.keys(form).some((key) => key.startsWith("__reactProps$")),
      ),
    undefined,
    { timeout: 10000 },
  );
}
async function loginAsAdmin() {
  await waitForLoginReady();
  await page.getByLabel("Employee ID / Admin Email").fill("admin@mptourism.in");
  await page.getByLabel("Password", { exact: true }).fill(adminPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin-console");
}
async function logout() {
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await page.waitForURL("**/login");
  await waitForLoginReady();
}
try {
  await check("Login renders Employee ID / Admin Email and has no public signup", async () => {
    await page.goto(`${base}/login`);
    await waitForLoginReady();
    assert.equal(await page.locator('link[rel="icon"]').getAttribute("href"), "/favicon.svg");
    const icon = await fetch(`${base}/favicon.svg`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get("content-type") || "", /image\/svg\+xml/);
    assert.equal(await page.getByRole("button", { name: /sign up/i }).count(), 0);
    assert.deepEqual(favicon404s, []);
  });
  await check(
    "Super Admin signs in to Admin Console and sees all navigation with no duplicates",
    async () => {
      await loginAsAdmin();
      await page.getByRole("heading", { name: "Admin Console", exact: true }).waitFor();
      const links = await page
        .locator("aside nav a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      assert.ok(links.includes("/hotels"));
      assert.ok(links.includes("/queries/query-tracker"));
      assert.equal(new Set(links).size, links.length);
    },
  );
  await check(
    "Empty Employee Master, one-step creation and success dialog work without exposing passwords",
    async () => {
      await page.getByRole("link", { name: "Manage Employees", exact: true }).click();
      await page.getByText("No employees have been created yet.").waitFor();
      await page.getByRole("button", { name: "Add Employee", exact: true }).click();
      const dialogRect = await page.getByRole("dialog").evaluate((node) => {
        const { x, y, right, bottom } = node.getBoundingClientRect();
        return { x, y, right, bottom, width: innerWidth, height: innerHeight };
      });
      assert.ok(dialogRect.x >= 0 && dialogRect.right <= dialogRect.width);
      assert.ok(dialogRect.y >= 0 && dialogRect.bottom <= dialogRect.height);
      await page.getByLabel("Full Name *", { exact: true }).fill("Browser fixture");
      await page.getByLabel("Initial Password *", { exact: true }).fill(employeePassword);
      await page.getByLabel("Confirm Password *", { exact: true }).fill(employeePassword);
      await page.getByRole("button", { name: "Create Employee", exact: true }).click();
      await page.getByRole("heading", { name: "Employee created successfully" }).waitFor();
      assert.ok((await page.getByRole("dialog").innerText()).includes("EMP-0001"));
      assert.ok(!(await page.getByRole("dialog").innerText()).includes(employeePassword));
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("cell", { name: "EMP-0001", exact: true }).waitFor();
      const stored = await page.evaluate(() => JSON.stringify(localStorage));
      assert.ok(!stored.includes(employeePassword));
      assert.ok(!stored.includes(adminPassword));
    },
  );
  await check("Employee table, header actions, and dialog fit requested viewports", async () => {
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      if (width < 768) await page.locator("aside.w-16").waitFor();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        `page overflow at ${width}`,
      );
      const add = page.getByRole("button", { name: "Add Employee", exact: true });
      const [heading, button] = await Promise.all([
        page.getByRole("heading", { name: "Employees & Login Access" }).boundingBox(),
        add.boundingBox(),
      ]);
      assert.ok(heading && button, `header controls missing at ${width}`);
      assert.ok(
        heading.x + heading.width <= button.x ||
          button.x + button.width <= heading.x ||
          heading.y + heading.height <= button.y ||
          button.y + button.height <= heading.y,
        `heading and Add Employee overlap at ${width}`,
      );
      if (width < 768) {
        assert.ok(
          await page
            .locator(".overflow-x-auto")
            .evaluate((node) => node.scrollWidth > node.clientWidth),
          "employee table should scroll inside its own container on mobile",
        );
        const actions = await page
          .locator("tbody tr")
          .last()
          .locator("td")
          .last()
          .locator("button")
          .evaluateAll((buttons) =>
            buttons.map((button) => {
              const { x, y, right, bottom } = button.getBoundingClientRect();
              return { x, y, right, bottom };
            }),
          );
        for (let i = 0; i < actions.length; i++) {
          for (let j = i + 1; j < actions.length; j++) {
            const overlaps =
              actions[i].x < actions[j].right &&
              actions[i].right > actions[j].x &&
              actions[i].y < actions[j].bottom &&
              actions[i].bottom > actions[j].y;
            assert.ok(!overlaps, "employee row action buttons overlap on mobile");
          }
        }
        await add.click();
        const mobileDialog = await page.getByRole("dialog").evaluate((node) => {
          const { x, y, right, bottom } = node.getBoundingClientRect();
          return { x, y, right, bottom, width: innerWidth, height: innerHeight };
        });
        assert.ok(mobileDialog.x >= 0 && mobileDialog.right <= mobileDialog.width);
        assert.ok(mobileDialog.y >= 0 && mobileDialog.bottom <= mobileDialog.height);
        await page.keyboard.press("Escape");
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("aside.w-64").waitFor();
  });
  await check(
    "Employee login shows only personal navigation; direct business URLs and refresh cannot restore the admin view",
    async () => {
      await logout();
      await page.getByLabel("Employee ID / Admin Email").fill("EMP-0001");
      await page.getByLabel("Password", { exact: true }).fill(employeePassword);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL("**/employee-home");
      await page.getByRole("heading", { name: "Welcome, Browser fixture" }).waitFor();
      assert.deepEqual(await page.locator("aside nav a").allTextContents(), [
        "Home",
        "My Profile",
        "Help & Training",
      ]);
      assert.ok(!(await page.locator("body").innerText()).includes("@employee.mptourism.in"));
      await page.goto(`${base}/hotels`);
      await page.waitForURL("**/employee-home");
      await page.reload();
      await page.getByRole("heading", { name: "Welcome, Browser fixture" }).waitFor();
      assert.equal(await page.locator('aside nav a[href="/hotels"]').count(), 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("aside.w-16").waitFor();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      );
      fs.mkdirSync(".employee-validation/screenshots", { recursive: true });
      await page.screenshot({
        path: ".employee-validation/screenshots/employee-home.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator("aside.w-64").waitFor();
    },
  );
  await check("Password reset invalidates the old password and accepts the new one", async () => {
    await logout();
    await loginAsAdmin();
    await page.getByRole("link", { name: "Manage Employees", exact: true }).click();
    await page.getByRole("button", { name: "Reset Password", exact: true }).click();
    await page.getByLabel("New Password *", { exact: true }).fill(replacementPassword);
    await page.getByLabel("Confirm Password *", { exact: true }).fill(replacementPassword);
    await page.getByRole("dialog").getByRole("button", { name: "Reset Password" }).click();
    await page.getByText("Password reset successfully.").waitFor();
    await logout();
    await page.getByLabel("Employee ID / Admin Email").fill("EMP-0001");
    await page.getByLabel("Password", { exact: true }).fill(employeePassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByText("Invalid Employee ID or password.", { exact: true }).first().waitFor();
    await page.getByLabel("Password", { exact: true }).fill(replacementPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/employee-home");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("aside.w-16").waitFor();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("aside.w-64").waitFor();
  });
  await check("Disable blocks login; enable restores the same employee account", async () => {
    await logout();
    await loginAsAdmin();
    await page.getByRole("link", { name: "Manage Employees", exact: true }).click();
    await page.getByRole("button", { name: "Disable Login", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disable Login" }).click();
    await page.getByText("Employee access updated.", { exact: true }).first().waitFor();
    await logout();
    await page.getByLabel("Employee ID / Admin Email").fill("EMP-0001");
    await page.getByLabel("Password", { exact: true }).fill("irrelevant");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByText("Invalid Employee ID or password.", { exact: true }).first().waitFor();
    await loginAsAdmin();
    await page.getByRole("link", { name: "Manage Employees", exact: true }).click();
    await page.getByRole("button", { name: "Enable Login", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enable Login" }).click();
    await page.getByText("Employee access updated.", { exact: true }).first().waitFor();
    await logout();
    await page.getByLabel("Employee ID / Admin Email").fill("EMP-0001");
    await page.getByLabel("Password", { exact: true }).fill(replacementPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/employee-home");
  });
  await check(
    "Delete removes the Employee Master and Auth login, preserving Super Admin",
    async () => {
      await logout();
      await loginAsAdmin();
      await page.getByRole("link", { name: "Manage Employees", exact: true }).click();
      await page.getByRole("button", { name: "Delete Employee", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete Employee" }).click();
      await page.getByText("No employees have been created yet.").waitFor();
      assert.equal(await page.getByText("EMP-0001", { exact: true }).count(), 0);
      await logout();
      await page.getByLabel("Employee ID / Admin Email").fill("EMP-0001");
      await page.getByLabel("Password", { exact: true }).fill(replacementPassword);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByText("Invalid Employee ID or password.", { exact: true }).first().waitFor();
    },
  );
  assert.deepEqual(errors, []);
  if (hydrationWarnings.length)
    console.warn(
      `Observed ${hydrationWarnings.length} React hydration warning(s) in Vite dev:\n${hydrationWarnings.slice(0, 2).join("\n")}`,
    );
  console.log(
    `Browser tests passed: ${count} test groups. Every Supabase request was intercepted; no live data was used or modified.`,
  );
} catch (error) {
  console.error(
    "Current page:",
    await page
      .locator("body")
      .innerText()
      .catch(() => "unavailable"),
  );
  console.error("Browser errors:", errors);
  fs.mkdirSync(".employee-validation/screenshots", { recursive: true });
  await page.screenshot({ path: ".employee-validation/screenshots/failure.png", fullPage: true });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        width: element.getBoundingClientRect().width,
        right: element.getBoundingClientRect().right,
      })),
  );
  console.error("Overflowing elements:", overflow);
  const ancestors = await page.locator("table").evaluate((table) => {
    const result = [];
    for (let node = table; node && result.length < 10; node = node.parentElement) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      result.push({
        tag: node.tagName,
        className: typeof node.className === "string" ? node.className : "",
        x: rect.x,
        width: rect.width,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        minWidth: style.minWidth,
        overflowX: style.overflowX,
        display: style.display,
      });
    }
    return result;
  });
  console.error("Employee table ancestors:", ancestors);
  throw error;
} finally {
  await browser.close();
}

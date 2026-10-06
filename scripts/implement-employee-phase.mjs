// Temporary local editing utility. Removed after implementation.
import fs from 'node:fs';
const edit = (path, transform) => fs.writeFileSync(path, transform(fs.readFileSync(path, 'utf8')));
edit('src/lib/crm/store.ts', s => {
  s = s.replace('const EMP_KEY = "mp_crm_employees_v2";', 'const EMP_KEY = "mp_crm_employees_v3";\nconst EMPLOYEE_CACHE_VERSION_KEY = "mp_crm_employee_cache_version";');
  s = s.replace(/const EMPLOYEE_ROSTER_KEY[^\n]*\nconst EMPLOYEE_ROSTER_REVISION[^\n]*\n/, '');
  s = s.slice(0, s.indexOf('const APPROVED_EMPLOYEE_ROSTER')) + s.slice(s.indexOf('function parse<T>'));
  const start = s.indexOf('  const applyRosterDefaults');
  const end = s.indexOf('\n\n  if (localStorage.getItem(DATASET_KEY)', start);
  s = s.slice(0, start) + `  migrateEmployeeCache();
  // Never trust browser employee identities for authorization, even on reload.
  employees = [];` + s.slice(end);
  s = s.replace('employees = ensureApprovedEmployeeRoster(snapshot.employees);', 'employees = snapshot.employees;');
  s = s.replace('export function hydrateCrm(snapshot: CrmSnapshot) {', `export function migrateEmployeeCache() {
  if (!isBrowser()) return;
  if (localStorage.getItem(EMPLOYEE_CACHE_VERSION_KEY) !== "3") {
    localStorage.removeItem("mp_crm_employees_v2");
    localStorage.removeItem("mp_crm_employee_roster_revision");
    localStorage.removeItem(EMP_KEY);
    localStorage.setItem(EMPLOYEE_CACHE_VERSION_KEY, "3");
  }
}

/** Replace only the read cache with rows fetched from Supabase. Never triggers a cloud push. */
export function replaceEmployeesFromCloud(records: Employee[]) {
  migrateEmployeeCache();
  employees = records;
  if (isBrowser()) localStorage.setItem(EMP_KEY, JSON.stringify(employees));
  emit();
}

export function hydrateCrm(snapshot: CrmSnapshot) {
  migrateEmployeeCache();`);
  // All employee mutations now go through the account-management Edge Function.
  const a = s.indexOf('export function addEmployee(');
  const b = s.indexOf('/** Persist explicit review/support', a);
  s = s.slice(0, a) + s.slice(b);
  const c = s.indexOf('export function removeEmployee(');
  const d = s.indexOf('\n}', c) + 2;
  s = s.slice(0, c) + s.slice(d);
  return s;
});
edit('src/lib/crm/crm-remote.ts', s => {
  const a = s.indexOf('    snapshot.employees.length');
  const b = s.indexOf('    snapshot.events.length', a);
  s = s.slice(0, a) + s.slice(b);
  s = s.replaceAll('employees: mergeById(remote.employees, local.employees)', 'employees: remote.employees');
  s = s.replace('    merged.employees.length !== remote.employees.length ||\n', '');
  const c = s.indexOf('  // Employees are not deleted');
  const d = s.indexOf('  await upsertSnapshot', c);
  s = s.slice(0, c) + '  // Employee records are read-only here; only server account actions write them.\n' + s.slice(d);
  return s;
});

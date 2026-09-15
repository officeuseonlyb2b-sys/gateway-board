# Plan — Connect the Existing Gateway Board CRM

## Audit baseline

The application already has the correct foundation: `crm_queries`, `crm_tasks`, `crm_employees`, `crm_events`, the shared CRM store, cloud sync/realtime, query workspace, task screens, dashboards, and linked costing versions.

The audit also found production gaps that explain the disconnected workflow:

- A legacy browser-only query store and duplicate detail route still coexist with the cloud-backed CRM. Current navigation is split between them.
- New Lead creates the shared CRM query, assignment events, and first task, but not a durable notification.
- Follow-up state is only partly structured and is split between query fields and tasks.
- Notifications and saved quotes are browser-local; notification links do not consistently open the canonical Query Detail.
- CRM synchronization uploads whole snapshots, allowing stale clients to overwrite newer row data.
- Query numbers are client-generated from array length, so concurrent creation can collide.
- Query Detail and dashboard screens still contain hardcoded or mock sections and disconnected controls.
- Overdue events exist, but query health and 48-hour manager escalation are not persisted idempotently.
- CRM data access currently allows every signed-in account to manage every CRM row; frontend roles are not backed by database policies.
- Existing cloud data currently has 3 queries, 12 tasks, and 57 events. No duplicate query numbers or orphaned linked task/event rows were found. Four historical tasks and twelve events legitimately have no query link.
- The current TypeScript check passes. Lint has substantial pre-existing formatting failures outside this CRM work.

## Implementation

### 1. Make the existing cloud CRM canonical

- Keep `src/lib/crm/*` and the current `/queries/*` screens as the single live CRM.
- Redirect or repoint legacy query/detail/follow-up routes to the canonical Query Tracker and Query Detail; do not create another store or page.
- Standardize every Query, Task, Follow-up, Pipeline, Dashboard, Notification, Costing, and Quotation link on the same `query_id` and canonical detail route.
- Preserve old browser data until it is reconciled with cloud records; add safe normalization defaults for older CRM JSON records.

### 2. Harden identity, persistence, and realtime

- Add a database-generated, collision-safe query number function and a unique constraint for non-null query numbers.
- Add stable account assignment fields while retaining existing employee-name fields for backward compatibility.
- Replace full-snapshot cloud writes with changed-row upserts and append-only event inserts; retain the local optimistic cache.
- Prevent stale realtime pulls from replacing newer unsaved state, deduplicate event writes, and keep one cleaned-up realtime subscription.
- Page or limit dashboard history while preserving complete event history in the database.
- Surface failed critical writes instead of reporting false success.

### 3. Extend the existing task/follow-up model

- Reuse `crm_tasks` for both ordinary tasks and structured follow-ups by adding optional fields for item kind, follow-up type, purpose, priority, status, outcome, completion details, next follow-up, and idempotency key.
- Keep query-level `followup_due` and `followup_note` as the current-action summary for old records and existing screens.
- Make scheduling/completion update the task/follow-up item, query summary, timeline event, last meaningful activity, and daily work lists together.
- Require an outcome on follow-up completion and make the next follow-up immediate for callback/interested/waiting/negotiation outcomes.
- Derive overdue state from actual due timestamps; do not rely on manually entered status.

### 4. Connect New Lead through daily employee work

- New Lead will atomically produce one canonical query, assignment activity, first-contact task, required next action/date, and deduplicated employee notification.
- Preserve “Unassigned” when no employee is selected and expose it to managers.
- Upgrade My Tasks/My Day to combine assigned tasks and follow-ups into Overdue, Due Today, and Upcoming groups with query/customer/action context.
- Task completion and progress updates will record employee, completion time, meaningful activity, and timeline events.

### 5. Upgrade the existing Query Detail workspace

- Replace remaining mock identity, requirement, lifecycle, commercial, activity, and follow-up values with the live canonical query and event history.
- Reuse existing quick-action components and connect Call outcomes, Add Note, Requirement Update, Schedule/Complete Follow-up, Create Task, Costing, Quotation, Status, Won, Lost, and Reopen actions.
- Add controlled main status, sub-stage, next action, next-action due time, priority, and derived health without redesigning the page.
- Enforce next action plus date/time for active states at the mutation boundary, with terminal-state exceptions.
- Require a lost reason, preserve history, close future actionable items without deleting them, and require a new next action on reopen.
- Do not count page views as meaningful activity.

### 6. Connect costing and quotation lifecycle

- Preserve every existing costing formula, step, field, and visual layout.
- Keep linked query identity and safe prefill throughout the existing quotation flow.
- On linked save/revision, persist the quote and immutable costing version, update commercials/lifecycle, and append costing/quotation events.
- Add explicit quotation-created, revised, sent, and opened-from-query actions using the existing quote and CRM stores.
- When a quotation is marked sent, schedule exactly one “Quotation follow-up” for three days later unless an equivalent open follow-up already exists.

### 7. Make notifications durable and actionable

- Extend the existing notification store/API with cloud persistence rather than introducing a competing notification system.
- Support assignment, reassignment, follow-up/task due and overdue, quotation follow-up, escalation, and important-update notifications.
- Store recipient account, canonical query link, and a deduplication key; notification clicks open the correct Query Detail.
- Retain existing non-CRM notification categories and preferences.

### 8. Query health, escalation, reporting, and filters

- Derive Green/Yellow/Red health from meaningful events, future actions, and overdue items using India time.
- Create one idempotent `manager_escalated` event and manager notification after 48 hours without meaningful activity; rendering a page must never create duplicates.
- Show inactive duration, employee, last activity, and existing Open/Reassign actions in Manager Dashboard while preserving its locked sections.
- Drive employee daily activity and historical movement only from CRM events.
- Replace hardcoded dashboard/tracker counts and no-op filters with real CRM values and working filters.
- Keep dashboard reads bounded to recent history while detailed history remains available on demand.

### 9. Role security and India time

- Map signed-in accounts to CRM employees by stable account ID, with safe email-based backfill for existing records.
- Replace broad CRM policies with database-enforced access: assigned work for staff; team/all access and reassignment for managers; full access for admins.
- Keep audit events append-only for staff and preserve administrative access.
- Store timestamps as UTC and format/compare business dates consistently in `Asia/Kolkata`.

## Database migration

One additive migration is required. It will:

- add stable assignment/account, structured action, and idempotency columns to existing CRM tables where needed;
- add collision-safe query-number generation and uniqueness;
- add the durable notification table used by the existing notification API;
- add indexes for query, owner, due date, state, event time, and notification deduplication;
- backfill safely without deleting existing JSON/history;
- replace broad CRM policies with role-aware policies;
- preserve grants, RLS, realtime, and all existing records.

No replacement CRM tables or parallel follow-up/task system will be created.

## Validation

- Run database migration checks, schema/security lint, RLS access checks, and realtime duplication checks.
- Run TypeScript, focused CRM tests, lint for changed files, and the production build.
- Test the full workflow with one real query: create, assign, notify, call/outcome, requirement, next action, follow-up/next follow-up, task completion, costing, quote save/revision/send, +3-day follow-up, reminder, overdue, 48-hour escalation, manager visibility, reassignment, won, lost reason, reopen, reporting, refresh, and second-session realtime.
- Verify no duplicate query, event, notification, task, escalation, or quotation follow-up is created.
- Published-link testing and publishing will only be claimed after the app is published and an authenticated account is available for that test.

## Scope protection

- No visual redesign.
- No costing formula changes.
- No replacement of hotel/rate, master data, authentication, Excel import/export, itinerary, or working dashboard sections.
- Existing data and legacy local cache remain intact until cloud reconciliation is verified.

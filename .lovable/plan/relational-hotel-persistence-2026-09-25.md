# Relational hotel persistence

## Scope
- Preserve the existing hotel screen and quotation behavior while replacing hotel, room, rate, and hotel-city writes through the shared JSON record.
- Keep all existing records and IDs so saved quotations remain linked.

## Implementation
1. Add relational `hotel_cities`, `hotels`, `hotel_rooms`, and `hotel_rates` tables with foreign keys, uniqueness safeguards, indexes, timestamps, grants, role-aware access policies, and realtime support.
2. Backfill the tables from `app_master_state.data` using conflict-safe inserts only; do not delete, truncate, reset, or overwrite the shared source record.
3. Add one hotel data module that loads relational rows, hydrates the existing in-memory view used by Hotels and quotation screens, subscribes to changes, and performs awaited database CRUD.
4. Route Add/Edit/Delete, room/rate replacement, inline city creation, quick-add, detail-page actions, and imports through the same module. Failures remain visible and successful writes refresh immediately.
5. Remove hotel arrays from shared-master write payloads so unrelated master updates cannot overwrite relational hotel data.
6. Expand search across hotel name, city, category, contact, email, phone, address, and type while preserving current filters and layout.

## Verification
- Confirm migrated counts, IDs, duplicate constraints, and orphan checks in the database.
- Exercise add, refresh, edit, search, quotation selection, and delete with an authenticated browser session.
- Run TypeScript checks, quotation audit, production build signal, and database security checks.

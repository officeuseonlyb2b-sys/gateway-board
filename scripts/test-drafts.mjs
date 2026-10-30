import assert from "node:assert/strict";
import { createServer } from "vite";

const values = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const { emptyDraft } = await vite.ssrLoadModule("/src/lib/wizard/types.ts");
  const { upsertDraft, getDraft, loadDrafts, duplicateDraft, deleteDraft } =
    await vite.ssrLoadModule("/src/lib/drafts-store.ts");

  const originalState = emptyDraft();
  originalState.program_name = "Draft Safety Regression";
  originalState.allocation_mode = "standard";
  originalState.transport = [{ id: "transport-a", vehicle_id: "vehicle-master", rate: 1250 }];
  originalState.hotel_options[0].selections = [
    { city_id: "city-a", routing_day: 1, hotel_id: "hotel-a", room_id: "room-a", meal_plan: "CP" },
  ];
  const originalId = upsertDraft(originalState, undefined, "Draft Safety Regression");
  const savedOriginal = getDraft(originalId);
  assert.ok(savedOriginal, "manual save can be read back before success is reported");

  const copy = duplicateDraft(savedOriginal);
  assert.notEqual(copy.id, originalId, "duplicate receives an independent draft ID");
  assert.equal(copy.draft_name, "Draft Safety Regression — Copy");
  assert.deepEqual(copy.wizard_state.transport, savedOriginal.wizard_state.transport);
  assert.deepEqual(copy.wizard_state.hotel_options, savedOriginal.wizard_state.hotel_options);

  copy.wizard_state.allocation_mode = "dynamic";
  copy.wizard_state.transport[0].rate = 9999;
  copy.wizard_state.hotel_options[0].dynamic_allocations = {
    1: [{ id: "allocation-b", room_id: "room-a", occupancy: "double", rooms: 2 }],
  };
  upsertDraft(copy.wizard_state, copy.id, copy.draft_name);
  assert.equal(getDraft(originalId).wizard_state.allocation_mode, "standard");
  assert.equal(getDraft(originalId).wizard_state.transport[0].rate, 1250);
  assert.equal(getDraft(originalId).wizard_state.hotel_options[0].dynamic_allocations, undefined);
  assert.equal(getDraft(copy.id).wizard_state.allocation_mode, "dynamic");

  // Editor discard no longer calls deleteDraft; the last persisted record remains readable.
  const unsavedWorkingCopy = getDraft(originalId).wizard_state;
  unsavedWorkingCopy.program_name = "Unsaved name";
  assert.equal(getDraft(originalId).wizard_state.program_name, "Draft Safety Regression");

  deleteDraft(copy.id);
  assert.equal(getDraft(copy.id), null, "explicit delete removes only the selected copy");
  assert.ok(getDraft(originalId), "deleting the copy cannot delete the original");
  assert.equal(loadDrafts().length, 1);

  console.log(
    "Draft safety regression passed: save/readback, non-destructive discard model, deep duplicate independence, Standard→Dynamic isolation, and selected delete.",
  );
} finally {
  await vite.close();
}

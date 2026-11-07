import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile("src/routes/_authenticated/costing.tsx", "utf8");
const step4 = source.slice(source.indexOf("function Step4("), source.indexOf("export function CustomizedRoutingEditor"));
assert.match(step4, /listSavedItineraryRoutingProgrammes\(\)/);
assert.doesNotMatch(step4, /usePrograms\(|getPrograms\(/);
assert.match(step4, /No saved Itinerary Master routing available\./);
console.log("Saved Itinerary Step 4 selector regression passed.");

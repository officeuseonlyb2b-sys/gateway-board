// GST slab helper re-exports. See src/lib/wizard/calc.ts for the canonical
// 5% vs 18% room-rate slab logic (≤7500 → 5%, >7500 → 18%).
export { gstRateFor } from "@/lib/wizard/calc";

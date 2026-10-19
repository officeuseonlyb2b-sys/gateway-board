import { FinalCostingWorkspace } from "../FinalCostingWorkspace";
import type { StepProps } from "../shared";

/** Step 9: the standard hotel commercial matrix. Underlying costing helpers
 * remain shared with final review and quotation generation. */
export function Step16({ draft, set }: StepProps) {
  return <FinalCostingWorkspace draft={draft} set={set} />;
}

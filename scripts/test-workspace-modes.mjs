import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

try {
  const costing = await vite.ssrLoadModule("/src/routes/_authenticated/costing.tsx");
  const types = await vite.ssrLoadModule("/src/lib/wizard/types.ts");

  const renderStepOne = (workflowMode) =>
    renderToStaticMarkup(
      createElement(costing.StepContent, {
        draft: {
          ...types.emptyDraft(),
          query_type: workflowMode === "brochure" ? "Brochure" : undefined,
        },
        set: () => {},
        workflowMode,
        step: 1,
        sub: 0,
        setSub: () => {},
        canFinalize: false,
        finalizeBlockers: [],
        costingWarnings: [],
        nextOfficialVersion: 1,
        isFinalizing: false,
        onFinalize: () => {},
        onSaveDraft: () => {},
        onExportDraft: () => {},
        onRequestReview: () => {},
      }),
    );

  const quotationMarkup = renderStepOne("quotation");
  assert.match(quotationMarkup, /B2B/);
  assert.match(quotationMarkup, /B2C/);
  assert.doesNotMatch(quotationMarkup, /Group \/ Package \/ Event/);

  const brochureMarkup = renderStepOne("brochure");
  assert.match(brochureMarkup, /Brochure costing/);
  assert.doesNotMatch(brochureMarkup, /Link an existing Query/);
  console.log("Workspace mode runtime component test passed: quotation and brochure Step 1 mount.");
} finally {
  await vite.close();
}

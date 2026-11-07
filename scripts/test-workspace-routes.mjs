import assert from "node:assert/strict";
import { createElement } from "react";
import fs from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { createServer } from "vite";

const cases = [
  ["/costing", "/_authenticated/costing"],
  ["/brochures", "/_authenticated/brochures"],
  ["/brochures/new", "/_authenticated/brochures/new"],
  ["/brochures/drafts", "/_authenticated/brochures/drafts"],
  ["/brochures/itineraries", "/_authenticated/brochures/itineraries"],
  ["/brochures/itinerary-master", "/_authenticated/brochures/itinerary-master"],
];
const redirects = [["/brochures/routings", "/brochures/itinerary-master"]];

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const sidebar = await fs.readFile("src/components/AppSidebar.tsx", "utf8");
  const builder = await fs.readFile("src/routes/_authenticated/brochures/itineraries.tsx", "utf8");
  const itineraryMaster = await fs.readFile("src/routes/_authenticated/brochures/itinerary-master.tsx", "utf8");
  const navOrder = ["New Brochure Costing", "Draft Brochures", "Itinerary Builder", "Itinerary Master", "Programme-wise Brochures"]
    .map((label) => sidebar.indexOf(`label: "${label}"`));
  assert.ok(navOrder.every((position) => position >= 0));
  assert.deepEqual(navOrder, [...navOrder].sort((left, right) => left - right), "Brochures sidebar entries remain in the requested order.");
  assert.ok(builder.includes("Itinerary Builder") && builder.includes("Import Excel / CSV"), "The existing content editor remains the Builder.");
  assert.ok(!builder.includes("Brochure Costing Status"), "The Builder does not contain the routing-master table.");
  for (const column of ["Itinerary / Package Name", "Linked Programme", "Duration", "Routing Summary", "Starting / Ending City", "Brochure Costing Status", "Pricing Version / Coverage", "Itinerary Status", "Actions"]) {
    assert.ok(itineraryMaster.includes(column), `Itinerary Master includes the ${column} column.`);
  }
  assert.ok(itineraryMaster.includes("explicitlySavedRoutingItineraries(records)"), "Itinerary Master filters to explicitly saved routing records.");

  const { routeTree } = await vite.ssrLoadModule("/src/routeTree.gen.ts");
  for (const [path, expectedLeafId] of cases) {
    const router = createRouter({
      routeTree,
      context: { queryClient: {} },
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    const matches = router.state.matches;
    assert.equal(matches.at(-1)?.routeId, expectedLeafId, `${path} resolves to its dedicated route`);
    assert.equal(router.state.location.pathname, path, `${path} remains stable after route load`);
    assert.doesNotThrow(
      () => renderToStaticMarkup(createElement(RouterProvider, { router })),
      `${path} renders its matched route tree`,
    );
  }
  for (const [path, expectedPath] of redirects) {
    const { Route: legacyRoute } = await vite.ssrLoadModule("/src/routes/_authenticated/brochures/routings.tsx");
    let redirectTarget;
    try {
      legacyRoute.options.beforeLoad();
    } catch (error) {
      redirectTarget = error.options?.to;
    }
    assert.equal(redirectTarget, expectedPath, `${path} redirects to the canonical workspace`);
  }
} finally {
  await vite.close();
}

console.log("Workspace route regression test passed: Builder and Master resolve separately, and former routing links redirect to Itinerary Master.");

import assert from "node:assert/strict";
import { publicationContentHash, publicPayload, slugify, validationErrors } from "../supabase/functions/_shared/portal-publication.ts";

const itinerary = { itineraryId: "itin-1", programmeId: "programme-1", programmeCode: "MP-1", code: "MP-1", title: "MP Journey", route: "Bhopal → Ujjain", overview: "Approved overview", brochureVersionId: "brochure-v1", routingFingerprint: "route-1", contentVersion: 3, duration: { days: 3, nights: 2 }, days: [{ day: 1, title: "Arrival", description: "Arrive", sightseeing: "Museum", activities: "Walk" }], highlights: ["Heritage"], inclusions: ["Hotel"], exclusions: ["Flights"], facts: ["ID required"], notes: ["Terms apply"] };
const brochure = { id: "brochure-v1", status: "Published", programme_id: "programme-1", route_fingerprint: "route-1", scenarios: [{ id: "s1" }], validation_errors: [], coverage_warnings: [] };
const input = { itinerary, brochure, banner: { base64: "YQ==", contentType: "image/png", name: "banner.png" } };
assert.equal(slugify(" MP Journey / 2026 "), "mp-journey-2026");
assert.deepEqual(validationErrors(input), []);
assert.match(validationErrors({ ...input, brochure: { ...brochure, route_fingerprint: "other" } }).join(" "), /Programme or routing/);
assert.match(validationErrors({ ...input, brochure: { ...brochure, coverage_warnings: ["missing"] } }).join(" "), /coverage is incomplete/);
assert.match(validationErrors({ ...input, brochure: { ...brochure, id: "other" } }).join(" "), /does not match/);
const publicDto = publicPayload(input, { url: "https://example.test/banner.png", bucket: "portal-package-banners-public", path: "a/banner.png", version: "v1" });
assert.equal(publicDto.media.banner.url, "https://example.test/banner.png");
assert.equal(publicDto.itineraries[0].body, "Arrive\nMuseum\nWalk");
assert.equal(JSON.stringify(publicDto).match(/supplier|markup|commission|group_total|price_per_person/gi), null);
const sameContentDifferentUrl = { ...publicDto, media: { ...publicDto.media, banner: { ...publicDto.media.banner, url: "https://other.test/new-signed-url" } } };
assert.equal(await publicationContentHash(publicDto), await publicationContentHash(sameContentDifferentUrl), "generated banner URL does not create a new revision");
assert.notEqual(await publicationContentHash(publicDto), await publicationContentHash({ ...publicDto, title: "Changed public content" }), "changed public content creates a new revision");
console.log("portal publication contract tests passed");

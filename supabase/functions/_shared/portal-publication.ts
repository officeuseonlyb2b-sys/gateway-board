export type PortalPublishInput = { itinerary: Record<string, unknown>; brochure: Record<string, unknown>; banner?: { base64: string; contentType: string; name: string } };
export const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Hash public content without the generated absolute banner URL. The bucket/path/version remain part of identity. */
export async function publicationContentHash(payload: Record<string, unknown>): Promise<string> {
  const media = payload.media as Record<string, unknown>;
  const banner = media.banner as Record<string, unknown>;
  const canonicalHashInput = { ...payload, media: { ...media, banner: { ...banner, url: "" } } };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonicalHashInput)));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
export function validationErrors(input: PortalPublishInput): string[] {
  const i = input.itinerary; const b = input.brochure;
  const required = [[i.programmeId,"canonical Programme ID"],[i.code,"package code"],[i.title,"title"],[i.route,"routing"],[i.overview,"overview"],[i.brochureVersionId,"Brochure version"],[i.routingFingerprint,"routing fingerprint"]] as const;
  const errors = required.filter(([, label]) => !String(required.find((x) => x[1] === label)?.[0] || "").trim()).map(([,label]) => `Missing ${label}.`);
  if (!Array.isArray(i.days) || !i.days.length) errors.push("Missing day-wise itinerary.");
  if (!input.banner) errors.push("Missing package banner.");
  // A saved Brochure may be Ready for Review; Portal eligibility still comes
  // exclusively from the independent approved snapshot checked by the handler.
  if (!['Published', 'Ready for Review'].includes(String(b.status))) errors.push("The linked Brochure version is not eligible for Portal approval.");
  if (b.id !== i.brochureVersionId) errors.push("The itinerary does not match the selected Brochure version.");
  if (b.programme_id !== i.programmeId || b.route_fingerprint !== i.routingFingerprint) errors.push("Programme or routing does not exactly match the selected Brochure version.");
  if (!Array.isArray(b.scenarios) || !b.scenarios.length || (b.validation_errors as unknown[] || []).length || (b.coverage_warnings as unknown[] || []).length) errors.push("Published pricing coverage is incomplete.");
  return errors;
}
export function publicPayload(input: PortalPublishInput, banner: { url: string; bucket: string; path: string; version: string }) {
  const i = input.itinerary; const days = (i.days as Array<Record<string, unknown>>).map((d) => ({ dayLabel: `Day ${d.day}`, title: String(d.title || ""), body: [d.description,d.sightseeing,d.activities].filter(Boolean).join("\n") }));
  return { schemaVersion: 1, code: String(i.code), slug: slugify(String(i.code)), title: String(i.title), durationDays: Number(i.duration && (i.duration as Record<string,unknown>).days), durationNights: Number(i.duration && (i.duration as Record<string,unknown>).nights), nightsDerived: false, routeRaw: String(i.route), highlights: i.highlights || [], itineraries: days, inclusions: i.inclusions || [], exclusions: i.exclusions || [], facts: (i.facts || []).map((description: string) => ({ title: "Travel information", description })), publicNotes: i.notes || [], media: { hero: null, banner: { ...banner, alt: String(i.title) }, highlights: [], itinerary: [] }, status: "published", source: { workbook: "CRM Itinerary Builder", revision: Number(i.contentVersion || 1), importMode: "published" }, reviewFlags: [] };
}

export type SubmittedSnapshot = Record<string, unknown>;
/** The canonical hash is calculated by PostgreSQL over jsonb::text. Browser
 * serialization must never be used to verify an authoritative database hash. */
export async function serverSnapshotHash(admin: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }> }, snapshot: SubmittedSnapshot) {
 const result=await admin.rpc('authoritative_jsonb_sha256',{p_payload:snapshot});
 if(result.error||!result.data||!/^[a-f0-9]{64}$/.test(result.data)) throw new Error(result.error?.message||'Authoritative snapshot hash failed');
 return result.data;
}
export const canonicalBrochureSnapshot = (snapshot: SubmittedSnapshot) => JSON.parse(JSON.stringify(snapshot)) as SubmittedSnapshot;
export function authoritativeBrochureErrors(snapshot: SubmittedSnapshot) {
 const errors=snapshotErrors(snapshot); const id=String(snapshot.id || ''); const brochureId=String(snapshot.brochure_id || '');
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(brochureId)) errors.push('Brochure and version IDs must be immutable UUIDs.');
 if (!snapshot.source_quote_id || !snapshot.source_quote_hash) errors.push('Immutable source identity is required.');
 if (!Array.isArray(snapshot.scenarios) || !snapshot.scenarios.length) errors.push('Complete pricing coverage is required.');
 return [...new Set(errors)];
}
export function snapshotErrors(snapshot: SubmittedSnapshot) {
 const scenarios = snapshot.scenarios as Array<Record<string, unknown>> | undefined; const errors:string[]=[];
 if (!snapshot.id || !snapshot.programme_id || !snapshot.route_fingerprint || !snapshot.version) errors.push('Snapshot identity, Programme, routing and version are required.');
 if (!['Published', 'Ready for Review'].includes(String(snapshot.status))) errors.push('Only a saved Ready for Review or Published Brochure snapshot can be submitted.');
 if (!snapshot.validity_from || !snapshot.validity_till || String(snapshot.validity_from) > String(snapshot.validity_till)) errors.push('Snapshot validity is invalid.');
 if (!scenarios?.length || (snapshot.validation_errors as unknown[] || []).length || (snapshot.coverage_warnings as unknown[] || []).length) errors.push('Snapshot pricing coverage is incomplete.');
 for (const scenario of scenarios || []) if (!scenario.id || !scenario.pax || !scenario.accommodation_option_id || !scenario.transport || !scenario.occupancy || !scenario.price_per_person || !scenario.validity_from || !scenario.validity_till) { errors.push('A selling-price scenario is incomplete.'); break; }
 return errors;
}

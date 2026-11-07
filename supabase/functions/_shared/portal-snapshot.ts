export type SubmittedSnapshot = Record<string, unknown>;
const stable = (value: unknown): string => {
 if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
 if (value && typeof value === 'object') { const row=value as Record<string,unknown>; return `{${Object.keys(row).sort().map((key)=>`${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`; }
 return JSON.stringify(value);
};
export async function snapshotHash(snapshot: SubmittedSnapshot) { const bytes = new TextEncoder().encode(stable(snapshot)); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join(''); }
export function snapshotErrors(snapshot: SubmittedSnapshot) {
 const scenarios = snapshot.scenarios as Array<Record<string, unknown>> | undefined; const errors:string[]=[];
 if (!snapshot.id || !snapshot.programme_id || !snapshot.route_fingerprint || !snapshot.version) errors.push('Snapshot identity, Programme, routing and version are required.');
 if (!['Published', 'Ready for Review'].includes(String(snapshot.status))) errors.push('Only a saved Ready for Review or Published Brochure snapshot can be submitted.');
 if (!snapshot.validity_from || !snapshot.validity_till || String(snapshot.validity_from) > String(snapshot.validity_till)) errors.push('Snapshot validity is invalid.');
 if (!scenarios?.length || (snapshot.validation_errors as unknown[] || []).length || (snapshot.coverage_warnings as unknown[] || []).length) errors.push('Snapshot pricing coverage is incomplete.');
 for (const scenario of scenarios || []) if (!scenario.id || !scenario.pax || !scenario.accommodation_option_id || !scenario.transport || !scenario.occupancy || !scenario.price_per_person || !scenario.validity_from || !scenario.validity_till) { errors.push('A selling-price scenario is incomplete.'); break; }
 return errors;
}

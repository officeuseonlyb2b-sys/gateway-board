import { clients, json, headers, requireActiveEmployee } from '../_shared/employee-auth.ts';
import { authoritativeBrochureErrors } from '../_shared/portal-snapshot.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { admin } = clients(); const actor = await requireActiveEmployee(request, admin);
  if (!actor) return json({ error: 'Active linked CRM employee required' }, 403);
  const { brochure, sourceQuote } = await request.json() as { brochure?: Record<string, unknown>; sourceQuote?: Record<string, unknown> };
  const errors = authoritativeBrochureErrors(brochure || {});
  if (errors.length || !sourceQuote || sourceQuote.id !== brochure?.source_quote_id) return json({ error: 'Validation failed', errors: [...errors, 'Exact source quote snapshot is required.'] }, 422);
  const saved = await admin.rpc('persist_authoritative_brochure_version', { p_actor: actor.id, p_brochure: brochure, p_source_quote: sourceQuote });
  if (saved.error || !saved.data?.brochureVersionId) return json({ error: saved.error?.message || 'Authoritative Brochure persistence failed' }, saved.error?.code === 'P0001' ? 422 : 502);
  return json(saved.data, saved.data.duplicate ? 200 : 201);
});

import { clients, json, headers, requireSuperAdmin } from '../_shared/employee-auth.ts';

/** Deliberately uses the service role after checking the caller. Snapshot tables have no browser RLS policy. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const { admin } = clients(); const user = await requireSuperAdmin(request, admin);
  if (!user) return json({ error: 'Active linked Super Admin required' }, 403);
  const { snapshotId } = await request.json();
  if (!snapshotId) return json({ error: 'Snapshot ID is required' }, 422);
  const found = await admin.from('portal_brochure_snapshots').select('id,version,approval_state,submitted_at,approved_at,approved_snapshot,snapshot_hash,submitted_by,verification_method,attestation_reference,reviewer_remarks').eq('id', snapshotId).maybeSingle();
  if (found.error || !found.data) return json({ error: 'Snapshot not found' }, 404);
  const row = found.data;
  return json({ snapshot: { id: row.id, version: row.version, status: row.approval_state, submittedAt: row.submitted_at, approvedAt: row.approved_at, snapshot: { ...row.approved_snapshot, snapshotHash: row.snapshot_hash, submittedBy: row.submitted_by, verificationMethod: row.verification_method, attestationReference: row.attestation_reference, reviewerRemarks: row.reviewer_remarks } } });
});

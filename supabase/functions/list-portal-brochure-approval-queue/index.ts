import { clients, json, headers, requirePortalPricingApprover } from '../_shared/employee-auth.ts';
Deno.serve(async (request) => {
 if(request.method==='OPTIONS')return new Response(null,{headers}); if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const {admin}=clients(); const reviewer=await requirePortalPricingApprover(request,admin); if(!reviewer)return json({error:'Active linked Portal Pricing Approver required'},403);
 const result=await admin.from('portal_brochure_snapshots').select('id,brochure_version_id,programme_id,route_fingerprint,version,snapshot_hash,submitted_at,submitted_by,approval_state').eq('approval_state','Pending').neq('submitted_by',reviewer.id).order('submitted_at',{ascending:true});
 if(result.error)return json({error:'Approval queue lookup failed'},502); return json({snapshots:result.data});
});

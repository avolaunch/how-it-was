import {authorize,fail,json} from '../../../server/records.js';
export async function onRequestGet(context) {
  if (!context.env.DB) return fail('Unavailable',503);
  const row=await authorize(context);
  if (!row) return fail('Record not found',404);
  return json({id:row.id,status:row.status,createdAt:row.created_at,paidAt:row.paid_at,finalizedAt:row.finalized_at,
    manifest:row.status==='finalized'?JSON.parse(row.manifest_json):null,manifestSha256:row.manifest_sha256});
}

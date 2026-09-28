import {authorize,fail,json,sameOrigin} from '../../../server/records.js';
import {deleteRecord} from '../../../server/retention.js';
export async function onRequestGet(context) {
  if (!context.env.DB) return fail('Unavailable',503);
  const row=await authorize(context);
  if (!row) return fail('Record not found',404);
  return json({id:row.id,status:row.status,createdAt:row.created_at,paidAt:row.paid_at,finalizedAt:row.finalized_at,
    manifest:row.status==='finalized'?JSON.parse(row.manifest_json):null,manifestSha256:row.manifest_sha256});
}
export async function onRequestDelete(context) {
  if (!context.env.DB || !context.env.PHOTOS) return fail('Unavailable',503);
  if (!sameOrigin(context.request)) return fail('Invalid origin',403);
  const row = await authorize(context);
  if (!row || !['finalized','deleting'].includes(row.status)) return fail('Record not found',404);
  await deleteRecord(context.env, row.id);
  return json({deleted:true});
}

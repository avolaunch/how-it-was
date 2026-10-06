import {sharingEnabled,viewerLink} from '../../../server/sharing.js';
import {authorize,fail,json,sameOrigin} from '../../../server/records.js';
import {deleteRecord} from '../../../server/retention.js';
export async function onRequestGet(context) {
  if (!context.env.DB) return fail('Unavailable',503);
  const row=await authorize(context);
  if (!row) return fail('Record not found',404);
  let shareLink=null;
  if(row.status==='finalized' && context.env.APP_ORIGIN){
    if(row.viewerAccess){const url=new URL('/vehicle-transport/record/?id='+encodeURIComponent(row.id),context.env.APP_ORIGIN);url.hash=context.request.headers.get('authorization').replace(/^Bearer /i,'');shareLink=url.href;}
    else {try{shareLink=await viewerLink(context.env,row,context.request.headers.get('authorization').replace(/^Bearer /i,''));}catch{}}
  }
  return json({canManage:!row.viewerAccess,shareLink,id:row.id,status:row.status,createdAt:row.created_at,paidAt:row.paid_at,finalizedAt:row.finalized_at,
    manifest:row.status==='finalized'?JSON.parse(row.manifest_json):null,manifestSha256:row.manifest_sha256,emailSharingEnabled:!row.viewerAccess && sharingEnabled(context.env)});
}
export async function onRequestDelete(context) {
  if (!context.env.DB || !context.env.PHOTOS) return fail('Unavailable',503);
  if (!sameOrigin(context.request)) return fail('Invalid origin',403);
  const row = await authorize(context);
  if (!row || !['finalized','deleting'].includes(row.status)) return fail('Record not found',404);
  await deleteRecord(context.env, row.id);
  return json({deleted:true});
}

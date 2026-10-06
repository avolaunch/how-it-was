import {deliverCreatorEmail} from '../../../../server/creator-email.js';
import {authorize,fail,json,requiredViews,sha256} from '../../../../server/records.js';
export async function onRequestPost(context) {
  const {env}=context;
  if (!env.DB || !env.PHOTOS) return fail('Unavailable',503);
  const row=await authorize(context);
  if (!row) return fail('Record not found',404);
  const token=context.request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  if (row.status==='finalized') return json({id:row.id,status:'finalized',sha256:row.manifest_sha256,creatorEmail:await deliverCreatorEmail(env,row,token)});
  if (row.status!=='paid_pending_upload') return fail('Payment is not confirmed',409);
  const result=await env.DB.prepare('SELECT photo_key,content_type,size_bytes,sha256 FROM photos WHERE record_id = ? ORDER BY photo_key').bind(row.id).all();
  const photos=result.results||[];
  if (requiredViews.some(key=>!photos.some(p=>p.photo_key===key))) return fail('Eight exterior views are required',409);
  const finalizedAt=new Date().toISOString();
  const manifest={format:'howitwas-condition-record-v1',id:row.id,createdAt:row.created_at,paidAt:row.paid_at,finalizedAt,
    vehicle:JSON.parse(row.vehicle_json),transport:JSON.parse(row.transport_json),damage:JSON.parse(row.damage_json),
    photos:photos.map(p=>({key:p.photo_key,type:p.content_type,size:p.size_bytes,sha256:p.sha256}))};
  const canonical=JSON.stringify(manifest), digest=await sha256(canonical);
  await env.PHOTOS.put('records/'+row.id+'/manifest.json',canonical,{httpMetadata:{contentType:'application/json'}});
  const update=await env.DB.prepare("UPDATE records SET status='finalized',finalized_at=?,manifest_json=?,manifest_sha256=? WHERE id=? AND status='paid_pending_upload'")
    .bind(finalizedAt,canonical,digest,row.id).run();
  if (!update.meta?.changes) return fail('Record changed; refresh and try again',409);
  const creatorEmail=await deliverCreatorEmail(env,{...row,status:'finalized',finalized_at:finalizedAt,manifest_json:canonical},token);
  return json({id:row.id,status:'finalized',sha256:digest,finalizedAt,creatorEmail});
}

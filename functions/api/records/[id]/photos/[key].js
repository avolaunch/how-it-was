import {authorize,fail,json,validPhotoKey} from '../../../../../server/records.js';
const MAX_BYTES=12*1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
function actualType(bytes, claimed) {
  if (claimed==='image/jpeg') return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if (claimed==='image/png') return [137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);
  if (claimed==='image/webp') return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if (claimed==='image/heic'||claimed==='image/heif') return String.fromCharCode(...bytes.slice(4,8))==='ftyp';
  return false;
}
export async function onRequestPut(context) {
  const {request,env,params}=context;
  if (!env.DB || !env.PHOTOS) return fail('Unavailable',503);
  const row=await authorize(context);
  if (!row) return fail('Record not found',404);
  if (row.status!=='paid_pending_upload') return fail('This record cannot accept photos',409);
  const key=String(params.key||''), damage=JSON.parse(row.damage_json);
  if (!validPhotoKey(key,damage)) return fail('Invalid photo view');
  const type=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if (!types.has(type)) return fail('Choose a JPEG, PNG, WebP or HEIC photo');
  const length=Number(request.headers.get('content-length')||0);
  if (length>MAX_BYTES) return fail('Photo is larger than 12 MB',413);
  const bytes=await request.arrayBuffer();
  if (!bytes.byteLength||bytes.byteLength>MAX_BYTES) return fail('Photo must be smaller than 12 MB',413);
  if (!actualType(new Uint8Array(bytes),type)) return fail('The file does not match its image type');
  const existing=await env.DB.prepare('SELECT COALESCE(SUM(size_bytes),0) AS total FROM photos WHERE record_id = ? AND photo_key != ?').bind(row.id,key).first();
  if (Number(existing?.total||0)+bytes.byteLength>120*1024*1024) return fail('Record photo limit reached',413);
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const objectKey='records/'+row.id+'/photos/'+key;
  await env.PHOTOS.put(objectKey,bytes,{httpMetadata:{contentType:type},customMetadata:{sha256:digest}});
  await env.DB.prepare('INSERT INTO photos (record_id,photo_key,object_key,content_type,size_bytes,sha256,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(record_id,photo_key) DO UPDATE SET content_type=excluded.content_type,size_bytes=excluded.size_bytes,sha256=excluded.sha256,created_at=excluded.created_at')
    .bind(row.id,key,objectKey,type,bytes.byteLength,digest,new Date().toISOString()).run();
  return json({key,sha256:digest,size:bytes.byteLength});
}
export async function onRequestGet(context) {
  const {env,params}=context;
  if (!env.DB || !env.PHOTOS) return fail('Unavailable',503);
  const row=await authorize(context);
  if (!row || row.status!=='finalized') return fail('Photo not found',404);
  const photo=await env.DB.prepare('SELECT * FROM photos WHERE record_id = ? AND photo_key = ?').bind(row.id,String(params.key||'')).first();
  if (!photo) return fail('Photo not found',404);
  const object=await env.PHOTOS.get(photo.object_key);
  if (!object) return fail('Photo unavailable',404);
  return new Response(object.body,{headers:{'content-type':photo.content_type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}

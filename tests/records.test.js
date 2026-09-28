import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,sha256,validPhotoKey,requiredViews} from '../server/records.js';
import {onRequestPost as webhook} from '../functions/api/stripe-webhook.js';
import {onRequestPut as upload} from '../functions/api/records/[id]/photos/[key].js';

test('record input is bounded and requires vehicle identity',()=>{
  assert.throws(()=>normalize({vehicle:{make:'A',model:'B'}}));
  const result=normalize({vehicle:{registration:' AB 12 ',make:'A',model:'B',vin:'x'.repeat(200)},damage:[{id:crypto.randomUUID(),area:'Door',description:'Scratch',photo:true}]});
  assert.equal(result.vehicle.registration,'AB 12');
  assert.equal(result.vehicle.vin.length,100);
  assert.equal(result.damage.length,1);
  assert.equal(requiredViews.length,8);
  assert.equal(validPhotoKey('damage-'+result.damage[0].id,result.damage),true);
  assert.equal(validPhotoKey('damage-'+crypto.randomUUID(),result.damage),false);
});

test('webhook rejects tampering and only marks the matching paid session',async()=>{
  const secret='whsec_test_secret',timestamp=Math.floor(Date.now()/1000);
  const event={type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_123',mode:'payment',payment_status:'paid',metadata:{record_id:'record-1'}}}};
  const payload=JSON.stringify(event);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  let sql='',bindings=[];
  const env={STRIPE_WEBHOOK_SECRET:secret,DB:{prepare(q){sql=q;return {bind(...args){bindings=args;return {run:async()=>({})};}}}}};
  const request=(body,signature)=>new Request('https://howitwas.co/api/stripe-webhook',{method:'POST',headers:{'Stripe-Signature':signature},body});
  assert.equal((await webhook({request:request(payload,'t='+timestamp+',v1='+sig),env})).status,200);
  assert.match(sql,/stripe_session_id/);
  assert.deepEqual(bindings.slice(1),['record-1','cs_test_123']);
  assert.equal((await webhook({request:request(payload+' ','t='+timestamp+',v1='+sig),env})).status,400);
  assert.equal((await webhook({request:request(payload,'t='+(timestamp-1000)+',v1='+sig),env})).status,400);
});

test('photo upload requires a paid bearer token',async()=>{
  const token='a'.repeat(64),id='123e4567-e89b-12d3-a456-426614174000';
  const row={id,access_hash:await sha256(token),status:'pending_payment',damage_json:'[]'};
  const env={PHOTOS:{},DB:{prepare(){return {bind(){return {first:async()=>row};}}}}};
  const request=new Request('https://howitwas.co/api/records/'+id+'/photos/front',{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10])});
  const response=await upload({request,env,params:{id,key:'front'}});
  assert.equal(response.status,409);
});

test('paid record accepts eight private views and finalizes a hashed manifest',async()=>{
  const {onRequestPost:finalize}=await import('../functions/api/records/[id]/finalize.js');
  const {onRequestGet:read}=await import('../functions/api/records/[id].js');
  const id='123e4567-e89b-12d3-a456-426614174001',token='b'.repeat(64),photos=new Map(),objects=new Map();
  const row={id,access_hash:await sha256(token),status:'paid_pending_upload',damage_json:'[]',
    vehicle_json:JSON.stringify({registration:'ABC123',make:'Test',model:'Car'}),
    transport_json:'{}',created_at:'2026-09-28T00:00:00.000Z',paid_at:'2026-09-28T00:01:00.000Z'};
  const DB={prepare(query){return {bind(...args){return {
    async first(){
      if(query.startsWith('SELECT * FROM records')) return row;
      if(query.includes('COALESCE(SUM')) return {total:[...photos.values()].filter(p=>p.photo_key!==args[1]).reduce((n,p)=>n+p.size_bytes,0)};
      if(query.startsWith('SELECT * FROM photos')) return photos.get(args[1])||null;
      return null;
    },
    async all(){return {results:[...photos.values()].sort((a,b)=>a.photo_key.localeCompare(b.photo_key))};},
    async run(){
      if(query.startsWith('INSERT INTO photos'))photos.set(args[1],{photo_key:args[1],object_key:args[2],content_type:args[3],size_bytes:args[4],sha256:args[5]});
      if(query.startsWith('UPDATE records SET status')){row.status='finalized';row.finalized_at=args[0];row.manifest_json=args[1];row.manifest_sha256=args[2];return {meta:{changes:1}};}
      return {meta:{changes:1}};
    }
  };}}}};
  const PHOTOS={async put(key,body){objects.set(key,body);},async get(key){return objects.get(key)||null;}};
  const env={DB,PHOTOS},headers={authorization:'Bearer '+token,'content-type':'image/png'};
  for(const key of requiredViews){
    const request=new Request('https://howitwas.co/api/records/'+id+'/photos/'+key,{method:'PUT',headers,body:new Uint8Array([137,80,78,71,13,10,26,10])});
    assert.equal((await upload({request,env,params:{id,key}})).status,200);
  }
  const context={request:new Request('https://howitwas.co/api/records/'+id,{headers}),env,params:{id}};
  const response=await finalize(context),result=await response.json();
  assert.equal(response.status,200);assert.equal(result.status,'finalized');
  assert.equal(result.sha256,await sha256(row.manifest_json));
  assert.equal(JSON.parse(row.manifest_json).photos.length,8);
  assert.ok(objects.has('records/'+id+'/manifest.json'));
  const saved=await (await read(context)).json();
  assert.equal(saved.manifest.vehicle.registration,'ABC123');
});

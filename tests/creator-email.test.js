import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {sha256,requiredViews} from '../server/records.js';
import {ensureCreatorContacts,deliverCreatorEmail,creatorAddress} from '../server/creator-email.js';
import {onRequestPost as finalize} from '../functions/api/records/[id]/finalize.js';
import {onRequestPost as creatorEmail} from '../functions/api/records/[id]/creator-email.js';
import {onRequestGet as record} from '../functions/api/records/[id].js';
const id='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
async function context(status='finalized'){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(await readFile(new URL('../db/0001_records.sql',import.meta.url),'utf8'));
  const manifest={vehicle:{registration:'ABC',make:'Test',model:'Car'},transport:{},damage:[],photos:[],finalizedAt:new Date().toISOString()};
  sql.prepare('INSERT INTO records (id,access_hash,status,vehicle_json,transport_json,damage_json,created_at,paid_at,finalized_at,manifest_json,manifest_sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,await sha256(token),status,JSON.stringify(manifest.vehicle),'{}','[]',manifest.finalizedAt,manifest.finalizedAt,manifest.finalizedAt,JSON.stringify(manifest),'digest');
  const DB={prepare(query){return {bind(...args){return {first:async()=>sql.prepare(query).get(...args)||null,run:async()=>{const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};},all:async()=>({results:sql.prepare(query).all(...args)})};}};}};
  const env={DB,PHOTOS:{put:async()=>{}},RESEND_API_KEY:'test',EMAIL_FROM:'How It Was <records@send.howitwas.co>',APP_ORIGIN:'https://howitwas.co'};
  await ensureCreatorContacts(env);
  sql.prepare('INSERT INTO creator_contacts (record_id,email,owner_hash) VALUES (?,?,?)').run(id,'work@example.com',await sha256(token));
  const request=new Request(env.APP_ORIGIN+'/api/records/'+id+'/finalize',{method:'POST',headers:{authorization:'Bearer '+token}});
  return {sql,env,params:{id},request};
}

test('creator address is validated independently of billing',()=>{
  assert.equal(creatorAddress(' Work@Example.com '),'work@example.com');
  for(const value of [null,'','bad','work@example.com\nBcc:other@example.com'])assert.throws(()=>creatorAddress(value));
});

test('fully saved paid record emails the chosen creator address, once',async t=>{
  const c=await context('paid_pending_upload');let calls=0;
  for(const key of requiredViews)c.sql.prepare('INSERT INTO photos VALUES (?,?,?,?,?,?,?)').run(id,key,key,'image/jpeg',1,'digest',new Date().toISOString());
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;assert.equal(url,'https://api.resend.com/emails');
    const message=JSON.parse(options.body);
    assert.deepEqual(message.to,['work@example.com']);
    assert.ok(message.text.includes('#'+token));
    assert.ok(message.text.includes('download the designed PDF'));
    assert.equal(c.sql.prepare('SELECT status FROM records WHERE id=?').get(id).status,'finalized');
    return Response.json({id:'email-id'});
  });
  const first=await (await finalize(c)).json();assert.equal(first.creatorEmail.status,'queued');
  const again=await (await finalize(c)).json();assert.equal(again.creatorEmail.status,'queued');assert.equal(calls,1);
});

test('incomplete or unpaid records do not send creator emails',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({id:'email'});});
  const c=await context('pending_payment');assert.equal((await finalize(c)).status,409);
  c.sql.prepare("UPDATE records SET status='paid_pending_upload'").run();assert.equal((await finalize(c)).status,409);
  assert.equal(calls,0);
});

test('email failure leaves the finalized record accessible and retries safely',async t=>{
  const c=await context();let success=false;const keys=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{keys.push(options.headers['Idempotency-Key']);return success?Response.json({id:'email'}):Response.json({error:'temporarily unavailable'},{status:503});});
  const first=await (await finalize(c)).json();assert.equal(first.status,'finalized');assert.equal(first.creatorEmail.status,'pending');
  success=true;assert.equal((await (await finalize(c)).json()).creatorEmail.status,'queued');
  assert.equal(keys[0],keys[1]);
});

test('old records can add a creator address, but recipients cannot or see it',async t=>{
  const c=await context();c.sql.prepare('DELETE FROM creator_contacts').run();
  t.mock.method(globalThis,'fetch',async()=>Response.json({id:'email'}));
  const request=email=>new Request(c.env.APP_ORIGIN+'/api/records/'+id+'/creator-email',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({email})});
  assert.equal((await (await creatorEmail({...c,request:request('work@example.com')})).json()).creatorEmail.status,'queued');
  assert.equal((await creatorEmail({...c,request:request('other@example.com')})).status,400);
  const {viewerLink}=await import('../server/sharing.js');
  const viewToken=new URL(await viewerLink(c.env,c.sql.prepare('SELECT * FROM records').get(),token)).hash.slice(1);
  assert.equal((await creatorEmail({...c,request:new Request(c.env.APP_ORIGIN+'/api/records/'+id+'/creator-email',{method:'POST',headers:{authorization:'Bearer '+viewToken},body:JSON.stringify({email:'other@example.com'})})})).status,404);
  const viewed=await (await record({...c,request:new Request(c.env.APP_ORIGIN+'/api/records/'+id,{headers:{authorization:'Bearer '+viewToken}})})).json();
  assert.equal(viewed.creatorEmail,null);
  assert.equal(JSON.stringify(viewed).includes('work@example.com'),false);
});

test('creator contact is deleted with record and ambiguous old sends require support',async()=>{
  const c=await context();c.sql.prepare("UPDATE creator_contacts SET attempt_started='2020-01-01'").run();
  const row=c.sql.prepare('SELECT * FROM records').get();
  assert.equal((await deliverCreatorEmail(c.env,row,token)).status,'support_required');
  c.sql.prepare('DELETE FROM records').run();assert.equal(c.sql.prepare('SELECT COUNT(*) AS n FROM creator_contacts').get().n,0);
});

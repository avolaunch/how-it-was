import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sha256} from '../server/records.js';
import {onRequestPost} from '../functions/api/records/[id]/share.js';
import {recipients} from '../server/sharing.js';
const id='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
async function context(){
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE records (id TEXT PRIMARY KEY,access_hash TEXT,status TEXT,finalized_at TEXT,manifest_json TEXT)');
  sql.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run(id,await sha256(token),'finalized',new Date().toISOString(),JSON.stringify({vehicle:{make:'A&B',model:'Car',registration:'ABC'},finalizedAt:new Date().toISOString()}));
  const DB={prepare(query){return {bind(...args){return {first:async()=>sql.prepare(query).get(...args)||null,run:async()=>sql.prepare(query).run(...args)};},run:async()=>sql.prepare(query).run()};}};
  return {sql,env:{DB,RESEND_API_KEY:'test-key',EMAIL_FROM:'How It Was <records@send.howitwas.co>',APP_ORIGIN:'https://howitwas.co'},params:{id}};
}
const request=(emails=['one@example.com'],requestId=crypto.randomUUID(),access=token)=>new Request('https://howitwas.co/api/records/'+id+'/share',{method:'POST',headers:{authorization:'Bearer '+access,'content-type':'application/json'},body:JSON.stringify({emails,requestId})});

test('recipient validation deduplicates and refuses malformed/injected addresses',()=>{
  assert.deepEqual(recipients(['One@example.com','one@example.com']),['one@example.com']);
  for(const value of [[],Array(11).fill('one@example.com'),['bad'],['one@example.com\nBcc:attacker@example.com'],[1]])assert.throws(()=>recipients(value));
});

test('only finalized, unexpired, authenticated records can be emailed',async t=>{
  const c=await context();t.mock.method(globalThis,'fetch',async()=>{throw Error('Should not send');});
  assert.equal((await onRequestPost({...c,request:request(undefined,undefined,'b'.repeat(64))})).status,404);
  c.sql.prepare("UPDATE records SET status='paid_pending_upload'").run();
  assert.equal((await onRequestPost({...c,request:request()})).status,404);
  c.sql.prepare("UPDATE records SET status='finalized',finalized_at='2020-01-01'").run();
  assert.equal((await onRequestPost({...c,request:request()})).status,404);
});

test('each recipient gets a private message; retries do not resend or spend quota',async t=>{
  const c=await context(),requestId=crypto.randomUUID();let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;assert.equal(url,'https://api.resend.com/emails/batch');
    const messages=JSON.parse(options.body);assert.equal(messages.length,2);
    assert.ok(messages.every(m=>m.to.length===1));
    assert.ok(messages.every(m=>m.html.includes('A&amp;B')&&!m.text.includes('#'+token)&&m.text.includes('#')));
    assert.equal(options.headers['Idempotency-Key'],'hiw-share-'+requestId);
    return Response.json({data:messages.map((_,i)=>({id:'mail-'+i}))});
  });
  const emails=['one@example.com','two@example.com'];
  assert.equal((await onRequestPost({...c,request:request(emails,requestId)})).status,200);
  assert.equal((await onRequestPost({...c,request:request(emails,requestId)})).status,200);
  assert.equal(calls,1);
  assert.equal(c.sql.prepare('SELECT SUM(recipient_count) AS n FROM share_requests').get().n,2);
  assert.equal((await onRequestPost({...c,request:request(['other@example.com'],requestId)})).status,409);
});

test('provider failures remain retryable and daily quota is enforced in SQL',async t=>{
  const c=await context(),requestId=crypto.randomUUID();let accepted=false;
  t.mock.method(globalThis,'fetch',async()=>accepted?Response.json({data:[{id:'mail'}]}):Response.json({message:'fail'},{status:503}));
  assert.equal((await onRequestPost({...c,request:request(undefined,requestId)})).status,502);
  accepted=true;
  assert.equal((await onRequestPost({...c,request:request(undefined,requestId)})).status,200);
  c.sql.prepare('UPDATE share_requests SET recipient_count=20').run();
  assert.equal((await onRequestPost({...c,request:request()})).status,429);
});

test('the global quota stops sharing across records',async t=>{
  const c=await context();let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({data:[{id:'mail'}]});});
  assert.equal((await onRequestPost({...c,request:request()})).status,200);
  c.sql.prepare("UPDATE share_requests SET record_id='other-record',recipient_count=80").run();
  assert.equal((await onRequestPost({...c,request:request()})).status,429);
  assert.equal(calls,1);
});


test('recipient links read the record but cannot delete or send emails',async()=>{
  const c=await context();
  const {viewerLink}=await import('../server/sharing.js');
  const {onRequestGet,onRequestDelete}=await import('../functions/api/records/[id].js');
  const row=c.sql.prepare('SELECT * FROM records WHERE id=?').get(id);
  const link=await viewerLink(c.env,row,token),viewToken=new URL(link).hash.slice(1);
  const response=await onRequestGet({...c,request:new Request('https://howitwas.co/api/records/'+id,{headers:{authorization:'Bearer '+viewToken}})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).canManage,false);
  assert.equal((await onRequestPost({...c,request:request(undefined,undefined,viewToken)})).status,404);
  assert.equal((await onRequestDelete({...c,env:{...c.env,PHOTOS:{}},request:new Request('https://howitwas.co/api/records/'+id,{method:'DELETE',headers:{authorization:'Bearer '+viewToken}})})).status,404);
  c.sql.prepare('UPDATE records SET access_hash=?').run('rotated');
  assert.equal((await onRequestGet({...c,request:new Request('https://howitwas.co/api/records/'+id,{headers:{authorization:'Bearer '+viewToken}})})).status,404);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost as recover} from '../functions/api/admin/recover.js';

test('support recovery requires an admin secret and a matching paid Stripe email',async()=>{
  const id='123e4567-e89b-12d3-a456-426614174000',secret='s'.repeat(64),changes=[];
  const row={id,status:'finalized',stripe_session_id:'cs_test_123',finalized_at:new Date().toISOString()};
  const env={APP_ORIGIN:'https://howitwas.co',STRIPE_SECRET_KEY:'sk_test_123',RECOVERY_ADMIN_SECRET:secret,
    DB:{prepare(sql){return {bind(...args){return {
      async first(){return row;},async run(){changes.push([sql,args]);return {meta:{changes:1}};}
    };}}}}
  };
  const request=(key,email)=>new Request('https://howitwas.co/api/admin/recover',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({id,email})});
  const original=globalThis.fetch;let stripeCalls=0;
  globalThis.fetch=async()=>{stripeCalls++;return new Response(JSON.stringify({client_reference_id:id,payment_status:'paid',livemode:false,customer_details:{email:'buyer@example.com'}}));};
  try{
    assert.equal((await recover({request:request('wrong','buyer@example.com'),env})).status,401);
    assert.equal(stripeCalls,0);
    assert.equal((await recover({request:request(secret,'other@example.com'),env})).status,403);
    assert.equal(changes.length,0);
    const result=await recover({request:request(secret,'BUYER@example.com'),env});
    assert.equal(result.status,200);
    assert.match((await result.json()).url,/^https:\/\/howitwas\.co\/vehicle-transport\/record\/\?id=.*#[0-9a-f]{64}$/);
    assert.match(changes[0][0],/UPDATE records SET access_hash/);
  }finally{globalThis.fetch=original;}
});

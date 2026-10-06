import {authorize,fail,json,sameOrigin,sha256} from '../../../../server/records.js';
import {sharingEnabled,recipients,shareMessages,viewerLink} from '../../../../server/sharing.js';

export async function onRequestPost(context){
  const {request,env}=context;
  if(!sameOrigin(request))return fail('Invalid origin',403);
  if(!env.DB)return fail('Unavailable',503);
  const row=await authorize(context);
  if(!row || row.status!=='finalized')return fail('Record not found',404);
  if(!sharingEnabled(env))return fail('Email sharing is not enabled yet. Copy the private link instead.',503);
  if(Number(request.headers.get('content-length')||0)>5000)return fail('Request too large',413);
  let input,emails;
  try{
    const body=await request.text();if(body.length>5000)return fail('Request too large',413);
    input=JSON.parse(body);emails=recipients(input.emails);
    if(!/^[0-9a-f-]{36}$/i.test(input.requestId||''))throw Error('Invalid sharing request.');
  }catch(error){return fail(error.message||'Check the email addresses.');}
  const token=request.headers.get('authorization').replace(/^Bearer /i,'');
  const hash=await sha256(JSON.stringify([token,emails])),day=new Date().toISOString().slice(0,10);
  try{
    // No recipient addresses or private links are stored in D1. The short-lived
    // ledger reserves quota atomically and makes retries safe with Resend.
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS share_requests (id TEXT PRIMARY KEY,record_id TEXT NOT NULL,day TEXT NOT NULL,recipient_count INTEGER NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT \'pending\')').run();
    await env.DB.prepare('DELETE FROM share_requests WHERE day < ?').bind(new Date(Date.now()-7*86400000).toISOString().slice(0,10)).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO share_requests (id,record_id,day,recipient_count,request_hash)
      SELECT ?,?,?,?,? WHERE
      COALESCE((SELECT SUM(recipient_count) FROM share_requests WHERE record_id=? AND day=?),0)+?<=20 AND
      COALESCE((SELECT SUM(recipient_count) FROM share_requests WHERE day=?),0)+?<=80`)
      .bind(input.requestId,row.id,day,emails.length,hash,row.id,day,emails.length,day,emails.length).run();
    const existing=await env.DB.prepare('SELECT * FROM share_requests WHERE id=?').bind(input.requestId).first();
    if(!existing)return fail('The daily email sharing limit has been reached. Copy the link instead.',429);
    if(existing.record_id!==row.id || existing.request_hash!==hash || existing.day!==day)return fail('Please start a new sharing request.',409);
    if(existing.status==='queued')return json({queued:true,count:emails.length});
    // Provider idempotency keys last 24 hours. Ledger retries are restricted to
    // their original UTC day so an old request cannot send again later.
    const sharedLink=await viewerLink(env,row,token);
    const sharedToken=new URL(sharedLink).hash.slice(1);
    const response=await fetch('https://api.resend.com/emails/batch',{
      method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':'hiw-share-'+input.requestId},
      body:JSON.stringify(shareMessages(env,row,sharedToken,emails))
    });
    const result=await response.json();
    if(!response.ok || !Array.isArray(result.data) || result.data.length!==emails.length || result.data.some(item=>!item.id))
      return fail('Email could not be queued. Retry the same request or copy the private link.',502);
    await env.DB.prepare("UPDATE share_requests SET status='queued' WHERE id=?").bind(input.requestId).run();
    return json({queued:true,count:emails.length});
  }catch{return fail('Email could not be queued. Retry the same request or copy the private link.',502);}
}

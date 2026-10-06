import {sha256} from './records.js';
import {recipients,sharingEnabled} from './sharing.js';

export function creatorAddress(value){
  if(typeof value!=='string')throw Error('Enter your creator email address.');
  try{return recipients([value])[0];}catch{throw Error('Enter a valid creator email address.');}
}
export async function ensureCreatorContacts(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS creator_contacts (
    record_id TEXT PRIMARY KEY,email TEXT NOT NULL,owner_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',attempt_started TEXT,
    FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE
  )`).bind().run();
}
export async function creatorContact(env,id){
  try{return await env.DB.prepare('SELECT * FROM creator_contacts WHERE record_id=?').bind(id).first();}
  catch(error){if(String(error.message).includes('no such table'))return null;throw error;}
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function deliverCreatorEmail(env,row,token){
  try{
    if(row.status!=='finalized' || await sha256(token)!==row.access_hash)return {status:'unavailable'};
    const contact=await creatorContact(env,row.id);
    if(!contact)return {status:'not_requested'};
    if(contact.owner_hash!==row.access_hash)return {status:'support_required',email:contact.email};
    if(contact.status==='queued')return {status:'queued',email:contact.email};
    if(!sharingEnabled(env))return {status:'pending',email:contact.email};
    // Keep retries inside the provider's 24-hour idempotency window. After an
    // ambiguous older attempt, support can investigate rather than auto-resend.
    const now=new Date();
    await env.DB.prepare('UPDATE creator_contacts SET attempt_started=COALESCE(attempt_started,?) WHERE record_id=?').bind(now.toISOString(),row.id).run();
    const reserved=await creatorContact(env,row.id);
    if(now-new Date(reserved.attempt_started)>23*3600000)return {status:'support_required',email:contact.email};
    const m=JSON.parse(row.manifest_json),link=new URL('/vehicle-transport/record/?id='+encodeURIComponent(row.id),env.APP_ORIGIN);link.hash=token;
    const title=[m.vehicle.make,m.vehicle.model,m.vehicle.registration].filter(Boolean).join(' · ');
    const explanation='Your paid vehicle condition record is saved. Open it to view all photos, download the designed PDF and share a separate view-only link with recipients.';
    const warning='Keep this creator link private. It allows you to manage and permanently delete the record. Use the sharing options inside the record for other people.';
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':'hiw-creator-'+row.id+'-'+row.access_hash},
      body:JSON.stringify({from:env.EMAIL_FROM,to:[contact.email],reply_to:'support@howitwas.co',subject:'Your How It Was record is ready',
        text:'How It Was\n\n'+title+'\n\n'+explanation+'\n\n'+link.href+'\n\n'+warning+'\n\nRecord ID: '+row.id+'\nServer receipt: '+m.finalizedAt+'\nAccess lasts 12 months from finalisation unless deleted earlier.\n\nHelp: support@howitwas.co',
        html:'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#263346"><div style="background:#122136;color:white;padding:24px;font-size:24px">How It Was</div><div style="padding:24px"><h1 style="font-size:22px">Your record is ready</h1><p>'+escape(title)+'</p><p>'+explanation+'</p><p style="margin:28px 0"><a style="background:#295cd1;color:white;padding:14px 20px;text-decoration:none;border-radius:6px" href="'+escape(link.href)+'">Open your creator record</a></p><p>'+warning+'</p><p>Record ID: '+escape(row.id)+'<br>Server receipt: '+escape(m.finalizedAt)+'</p><p>Access lasts 12 months from finalisation unless deleted earlier.</p><p>Help: support@howitwas.co</p></div></div>'})
    });
    const result=await response.json();
    if(!response.ok||!result.id)return {status:'pending',email:contact.email};
    await env.DB.prepare("UPDATE creator_contacts SET status='queued' WHERE record_id=?").bind(row.id).run();
    return {status:'queued',email:contact.email};
  }catch{return {status:'pending'};}
}

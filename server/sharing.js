import {sha256} from './records.js';
export const sharingEnabled=env=>Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && env.APP_ORIGIN);
export function recipients(input){
  if(!Array.isArray(input)||!input.length||input.length>10)throw Error('Add between 1 and 10 email addresses.');
  const emails=[...new Set(input.map(value=>typeof value==='string'?value.trim().toLowerCase():''))].sort();
  if(emails.some(email=>email.length>254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)))throw Error('Check each email address.');
  return emails;
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function shareMessages(env,row,token,emails){
  const manifest=JSON.parse(row.manifest_json),vehicle=manifest.vehicle;
  const link=new URL('/vehicle-transport/record/?id='+encodeURIComponent(row.id),env.APP_ORIGIN);link.hash=token;
  const title=[vehicle.make,vehicle.model,vehicle.registration].filter(Boolean).join(' · ');
  const message='A private vehicle condition record has been shared with you. View the photos, handover details and existing marks, or download a PDF.';
  const warning='Keep this link private. Anyone with the complete link can view the record. This recipient link does not allow deletion. Receiving it does not mean you have accepted the condition or agreed to any liability.';
  const html='<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#263346"><div style="background:#122136;color:white;padding:24px;font-size:24px">How It Was</div><div style="padding:24px"><h1 style="font-size:22px">Your shared vehicle record</h1><p>'+escape(title)+'</p><p>'+message+'</p><p style="margin:28px 0"><a style="background:#295cd1;color:white;padding:14px 20px;text-decoration:none;border-radius:6px" href="'+escape(link.href)+'">View private record</a></p><p style="font-size:13px">'+warning+'</p><p>Server receipt: '+escape(manifest.finalizedAt)+'<br>Access lasts for 12 months from finalisation unless the record is deleted earlier.</p><p style="font-size:12px;color:#667080">Sent through How It Was at the request of someone holding this private link. For help or to report an unwanted share, contact support@howitwas.co.</p></div></div>';
  return emails.map(email=>({from:env.EMAIL_FROM,to:[email],subject:'A vehicle condition record has been shared with you',html,
    text:'How It Was\n\n'+title+'\n\n'+message+'\n\n'+link.href+'\n\n'+warning+'\n\nServer receipt: '+manifest.finalizedAt+'\nAccess lasts 12 months from finalisation unless deleted earlier.\n\nHelp: support@howitwas.co',
    reply_to:'support@howitwas.co'}));
}

export async function viewerLink(env,row,ownerToken){
  const token=await sha256('hiw-viewer-v1:'+ownerToken);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS record_viewers (record_id TEXT PRIMARY KEY,access_hash TEXT NOT NULL,owner_hash TEXT NOT NULL,FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE)').bind().run();
  await env.DB.prepare('INSERT INTO record_viewers (record_id,access_hash,owner_hash) VALUES (?,?,?) ON CONFLICT(record_id) DO UPDATE SET access_hash=excluded.access_hash,owner_hash=excluded.owner_hash').bind(row.id,await sha256(token),row.access_hash).run();
  const url=new URL('/vehicle-transport/record/?id='+encodeURIComponent(row.id),env.APP_ORIGIN);url.hash=token;
  return url.href;
}

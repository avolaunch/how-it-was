import {authorize,fail,json,sameOrigin} from '../../../../server/records.js';
import {creatorAddress,ensureCreatorContacts,creatorContact,deliverCreatorEmail} from '../../../../server/creator-email.js';

export async function onRequestPost(context){
  const {env,request}=context;
  if(!sameOrigin(request))return fail('Invalid origin',403);
  if(!env.DB)return fail('Unavailable',503);
  const row=await authorize(context);
  if(!row || row.status!=='finalized')return fail('Record not found',404);
  let email;
  try{
    const body=await request.text();if(body.length>1000)return fail('Request too large',413);
    email=creatorAddress(JSON.parse(body).email);
  }catch(error){return fail(error.message||'Enter your email address.');}
  await ensureCreatorContacts(env);
  // Older paid records have no contact yet. An authenticated creator can add
  // their address once; existing checkout addresses cannot be silently replaced.
  await env.DB.prepare('INSERT OR IGNORE INTO creator_contacts (record_id,email,owner_hash) VALUES (?,?,?)').bind(row.id,email,row.access_hash).run();
  const contact=await creatorContact(env,row.id);
  if(contact.email!==email)return fail('Use the creator email saved before checkout. Contact support to correct it.');
  const token=request.headers.get('authorization').replace(/^Bearer /i,'');
  return json({creatorEmail:await deliverCreatorEmail(env,row,token)});
}

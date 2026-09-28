import {fail,json,paymentMode,randomToken,sha256} from '../../../server/records.js';
import {expired} from '../../../server/retention.js';

export async function onRequestPost({request,env}) {
  if (!env.DB || !env.APP_ORIGIN || !env.RECOVERY_ADMIN_SECRET || !paymentMode(env)) return fail('Unavailable',503);
  if (Number(request.headers.get('content-length')||0)>2000) return fail('Request too large',413);
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /i,'') || '';
  if (supplied.length < 32 || supplied.length !== env.RECOVERY_ADMIN_SECRET.length ||
      await sha256(supplied) !== await sha256(env.RECOVERY_ADMIN_SECRET)) return fail('Unauthorized',401);
  let id,email;
  try {({id,email}=await request.json());} catch {return fail('Invalid request');}
  if (!/^[0-9a-f-]{36}$/i.test(id||'') || typeof email !== 'string' || email.length > 254) return fail('Invalid request');
  const row=await env.DB.prepare('SELECT id,status,stripe_session_id,finalized_at FROM records WHERE id = ?').bind(id).first();
  if (!row || row.status !== 'finalized' || !row.stripe_session_id || expired(row.finalized_at)) return fail('Record not found',404);
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(row.stripe_session_id),{
    headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY}
  });
  if (!response.ok) return fail('Could not verify payment',502);
  const session=await response.json();
  if (session.client_reference_id !== id || session.payment_status !== 'paid' ||
      session.livemode !== (paymentMode(env)==='live') ||
      session.customer_details?.email?.toLowerCase() !== email.trim().toLowerCase()) return fail('Payment details do not match',403);
  const token=randomToken();
  const update=await env.DB.prepare('UPDATE records SET access_hash = ? WHERE id = ? AND status = ?')
    .bind(await sha256(token),id,'finalized').run();
  if (!update.meta?.changes) return fail('Record changed; retry',409);
  return json({url:env.APP_ORIGIN+'/vehicle-transport/record/?id='+encodeURIComponent(id)+'#'+token});
}

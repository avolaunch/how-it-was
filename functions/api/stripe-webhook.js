import {fail,json,paymentMode} from '../../server/records.js';
const encoder = new TextEncoder();

async function validSignature(payload, header, secret) {
  const timestamp = Number(/(?:^|,)\s*t=(\d+)/.exec(header || '')?.[1]);
  const signatures = [...(header || '').matchAll(/(?:^|,)\s*v1=([0-9a-f]+)/g)].map(x=>x[1]);
  if (!timestamp || !signatures.length || Math.abs(Date.now()/1000-timestamp)>300) return false;
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const result = new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(timestamp+'.'+payload)));
  const expected = [...result].map(x=>x.toString(16).padStart(2,'0')).join('');
  return signatures.some(sig=>sig.length===expected.length && [...sig].reduce((n,c,i)=>n|(c.charCodeAt(0)^expected.charCodeAt(i)),0)===0);
}
export async function onRequestPost({request,env}) {
  const mode=paymentMode(env);
  if (!env.DB || !env.STRIPE_WEBHOOK_SECRET || !mode) return fail('Unavailable',503);
  const payload = await request.text();
  if (!await validSignature(payload,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET)) return fail('Invalid signature',400);
  let event;
  try {event=JSON.parse(payload);} catch {return fail('Invalid event');}
  if (event.livemode === (mode==='live') && ['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session=event.data?.object, id=session?.metadata?.record_id;
    if (session?.mode==='payment' && session?.payment_status==='paid' && id && session.id) {
      await env.DB.prepare("UPDATE records SET status = 'paid_pending_upload', paid_at = COALESCE(paid_at, ?) WHERE id = ? AND stripe_session_id = ? AND status = 'pending_payment'")
        .bind(new Date().toISOString(),id,session.id).run();
    }
  }
  return json({received:true});
}

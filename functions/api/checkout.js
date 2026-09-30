import {configured,fail,json,normalize,paymentMode,randomToken,sameOrigin,sha256,verifyTurnstile} from '../../server/records.js';
import {selectPrice,loadPrices} from '../../server/pricing.js';

export async function onRequestPost({request,env}) {
  if (!sameOrigin(request)) return fail('Invalid origin',403);
  if (!configured(env)) return fail('Online records are not configured',503);
  if (new URL(request.url).origin !== env.APP_ORIGIN) return fail('Use the configured site origin',403);
  if (Number(request.headers.get('content-length') || 0) > 16000) return fail('Request too large',413);
  let input, details;
  try {
    input = await request.json();
    details = normalize(input);
  } catch (error) { return fail(error.message || 'Invalid details'); }
  if (!await verifyTurnstile(input.turnstileToken,request.headers.get('CF-Connecting-IP'),env.TURNSTILE_SECRET)) return fail('Please complete the verification',403);
  let prices;
  try { prices=await loadPrices(env,paymentMode(env)==='live'); }
  catch { return fail('Online checkout is temporarily unavailable. Please try again later.',503); }
  const selected=selectPrice(prices,input.currency);
  if (!selected) return fail('Choose an available payment currency.');

  const id = crypto.randomUUID(), token = randomToken(), now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO records (id,access_hash,vehicle_json,transport_json,damage_json,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id,await sha256(token),JSON.stringify(details.vehicle),JSON.stringify(details.transport),JSON.stringify(details.damage),now).run();

  const form = new URLSearchParams({
    mode:'payment',
    'line_items[0][price]':selected.id,
    'line_items[0][quantity]':'1',
    currency:selected.currency,
    'adaptive_pricing[enabled]':'false',
    client_reference_id:id,
    'metadata[record_id]':id,
    'metadata[currency]':selected.currency,
    success_url:env.APP_ORIGIN+'/vehicle-transport/complete/',
    cancel_url:env.APP_ORIGIN+'/vehicle-transport/capture/?checkout=cancelled&currency='+selected.currency,
  });
  let session;
  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',
      headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY,'content-type':'application/x-www-form-urlencoded','idempotency-key':'record-'+id},
      body:form
    });
    session = await response.json();
    if (!response.ok || !session.id || !/^https:\/\/checkout\.stripe\.com\//.test(session.url || '')) throw Error('Stripe Checkout unavailable');
  } catch {
    await env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
    return fail('Could not start checkout. Please try again.',502);
  }
  await env.DB.prepare('UPDATE records SET stripe_session_id = ? WHERE id = ?').bind(session.id,id).run();
  return json({id,token,url:session.url});
}

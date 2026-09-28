export const requiredViews = ['front','front_left','driver_side','rear_left','rear','rear_right','passenger_side','front_right'];
export const optionalViews = ['windscreen','wheels','roof','odometer'];
const encoder = new TextEncoder();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export function fail(message, status = 400) { return json({error:message}, status); }
export function paymentMode(env) {
  if (env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) return 'test';
  if (env.STRIPE_SECRET_KEY?.startsWith('sk_live_') && env.PAYMENT_MODE === 'live' && env.LIVE_PAYMENTS_ENABLED === 'true') return 'live';
  return null;
}
export function configured(env) {
  return Boolean(env.DB && env.PHOTOS && paymentMode(env) && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET && env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY && env.APP_ORIGIN);
}
export async function sha256(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function randomToken(bytes = 32) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
export function limitedText(value, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0,max) : '';
}
export function normalize(input) {
  if (!input || typeof input !== 'object') throw Error('Missing record details');
  const v = input.vehicle || {}, t = input.transport || {};
  const vehicle = Object.fromEntries(['registration','make','model','year','colour','vin','odometerKm'].map(k=>[k,limitedText(v[k],100)]));
  const transport = Object.fromEntries(['collectionDate','carrier','origin','destination'].map(k=>[k,limitedText(t[k],180)]));
  if (!vehicle.registration || !vehicle.make || !vehicle.model) throw Error('Add the registration, make and model');
  const damage = (Array.isArray(input.damage) ? input.damage : []).slice(0,20).map(d=>({
    id: /^[0-9a-f-]{36}$/i.test(d.id) ? d.id : crypto.randomUUID(),
    area:limitedText(d.area,100),kind:limitedText(d.kind,100),
    description:limitedText(d.description,1000),photo:Boolean(d.photo)
  }));
  if (damage.some(d=>!d.area || !d.description)) throw Error('Incomplete mark description');
  return {vehicle,transport,damage};
}
export async function authorize(context) {
  const id = String(context.params.id || '');
  const token = context.request.headers.get('authorization')?.replace(/^Bearer /i,'') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(token)) return null;
  const row = await context.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first();
  if (!row || row.access_hash !== await sha256(token)) return null;
  return row;
}
export function validPhotoKey(key, damage) {
  return requiredViews.includes(key) || optionalViews.includes(key) ||
    (key.startsWith('damage-') && damage.some(d=>d.id === key.slice(7) && d.photo));
}
export async function verifyTurnstile(token, ip, secret) {
  if (!token || typeof token !== 'string') return false;
  const body = new FormData(); body.set('secret', secret); body.set('response', token);
  if (ip) body.set('remoteip',ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body});
  return response.ok && (await response.json()).success === true;
}

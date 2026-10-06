import test from 'node:test';
import assert from 'node:assert/strict';
import {availablePrices,selectPrice,defaultCurrency} from '../server/pricing.js';
import {onRequestGet as config} from '../functions/api/config.js';
import {onRequestPost as checkout} from '../functions/api/checkout.js';

function environment(writes=[]) {
  return {DB:{prepare(sql){return {bind(...args){return {run:async()=>{writes.push({sql,args});return {};}};}};}},PHOTOS:{},
    STRIPE_PRICE_ID:'price_shared',STRIPE_SECRET_KEY:'sk_live_example',
    STRIPE_WEBHOOK_SECRET:'whsec_example',PAYMENT_MODE:'live',LIVE_PAYMENTS_ENABLED:'true',
    TURNSTILE_SECRET:'secret',TURNSTILE_SITE_KEY:'public',APP_ORIGIN:'https://howitwas.co'};
}
function stripePrice() {
  return {livemode:true,active:true,type:'one_time',billing_scheme:'per_unit',currency:'gbp',unit_amount:499,
    currency_options:{zar:{unit_amount:9900},usd:{unit_amount:699},eur:{unit_amount:599},aud:{unit_amount:999},
      cad:{unit_amount:899},nzd:{unit_amount:1199},sgd:{unit_amount:899},aed:{unit_amount:2499},chf:{unit_amount:599},inr:{unit_amount:39900}}};
}
function request(env,currency='zar') {
  return new Request(env.APP_ORIGIN+'/api/checkout',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({vehicle:{registration:'ABC',make:'Test',model:'Car'},currency,creatorEmail:'creator@example.com',amount:1,priceId:'price_attacker',turnstileToken:'token'})});
}

test('all configured markets share one price ID and use Stripe amounts',()=>{
  const env=environment(),price=stripePrice(),prices=availablePrices(env,price,true);
  assert.equal(prices.length,11);
  assert.ok(prices.every(p=>p.id==='price_shared'));
  assert.equal(selectPrice(prices,'zar').label,'R99');
  assert.equal(selectPrice(prices,'inr').label,'₹399');
  assert.equal(selectPrice(prices,'usd').label,'US$6.99');
  price.currency_options.zar.unit_amount=10900;
  delete price.currency_options.aud;
  price.currency_options.jpy={unit_amount:1000};
  const updated=availablePrices(env,price,true);
  assert.equal(selectPrice(updated,'zar').label,'R109');
  assert.equal(selectPrice(updated,'aud'),null);
  assert.equal(selectPrice(updated,'jpy'),null);
});

test('invalid prices and non-fixed options are not offered',()=>{
  const env=environment(),price=stripePrice();
  for(const change of [{livemode:false},{active:false},{type:'recurring'},{billing_scheme:'tiered'},
    {transform_quantity:{divide_by:2}},{custom_unit_amount:{enabled:true}}])
    assert.deepEqual(availablePrices(env,{...price,...change},true),[]);
  for(const option of [{unit_amount:0},{unit_amount:-1},{unit_amount:99.5},{unit_amount:null},{unit_amount:99,custom_unit_amount:{enabled:true}}])
    assert.equal(selectPrice(availablePrices(env,{...price,currency_options:{zar:option}},true),'zar'),null);
  assert.deepEqual(availablePrices({},price,true),[]);
});

test('geographic defaults only use configured currencies',()=>{
  const prices=availablePrices(environment(),stripePrice(),true);
  for(const [country,currency] of [['ZA','zar'],['US','usd'],['IE','eur'],['DE','eur'],['AU','aud'],['IN','inr'],['XX','gbp']])
    assert.equal(defaultCurrency(prices,country),currency);
  assert.equal(defaultCurrency(prices.filter(p=>p.currency==='usd'),'ZA'),'usd');
});

test('config loads currencies from Stripe without exposing identifiers or secrets',async t=>{
  let price=stripePrice();
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(String(url),'https://api.stripe.com/v1/prices/price_shared?expand[]=currency_options');
    return Response.json(price);
  });
  const env=environment(),request=new Request(env.APP_ORIGIN+'/api/config',{headers:{'CF-IPCountry':'ZA'}});
  const result=await (await config({env,request})).json();
  assert.equal(result.defaultCurrency,'zar');
  assert.equal(result.prices.length,11);
  assert.equal(JSON.stringify(result).includes('price_shared'),false);
  assert.equal(JSON.stringify(result).includes('sk_live'),false);
  price={...price,livemode:false};
  const unavailable=await (await config({env,request})).json();
  assert.deepEqual(unavailable.prices,[]);
  assert.equal(unavailable.pricingUnavailable,true);
});

test('checkout uses one ID, refreshes amounts, and rejects unavailable currency before writes',async t=>{
  const writes=[],env=environment(writes);
  let price=stripePrice(),sessionCalls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('turnstile')) return Response.json({success:true});
    if(String(url).includes('/prices/')) return Response.json(price);
    sessionCalls++;
    const form=new URLSearchParams(options.body);
    assert.equal(form.get('line_items[0][price]'),'price_shared');
    assert.equal(form.get('currency'),'zar');
    assert.equal(form.get('adaptive_pricing[enabled]'),'false');
    assert.equal(form.get('line_items[0][quantity]'),'1');
    assert.match(form.get('cancel_url'),/currency=zar$/);
    return Response.json({id:'cs_live_example',url:'https://checkout.stripe.com/c/pay/example'});
  });
  assert.equal((await checkout({env,request:request(env)})).status,200);
  assert.equal(sessionCalls,1);
  const contact=writes.find(write=>write.sql.startsWith('INSERT INTO creator_contacts'));
  assert.equal(contact.args[1],'creator@example.com');
  writes.length=0;
  delete price.currency_options.zar;
  assert.equal((await checkout({env,request:request(env)})).status,400);
  assert.equal(writes.length,0);
  price={...price,active:false};
  assert.equal((await checkout({env,request:request(env)})).status,503);
  assert.equal(writes.length,0);
  assert.equal(sessionCalls,1);
});

test('Stripe outage blocks new checkout without losing or writing a record',async t=>{
  const writes=[],env=environment(writes);
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('turnstile')?Response.json({success:true}):new Response('',{status:503}));
  assert.equal((await checkout({env,request:request(env)})).status,503);
  assert.equal(writes.length,0);
});

test('Preview accepts a test Price and rejects live prices',async t=>{
  const env=environment();env.PAYMENT_MODE='test';env.STRIPE_SECRET_KEY='sk_test_example';
  let price={...stripePrice(),livemode:false};
  t.mock.method(globalThis,'fetch',async()=>Response.json(price));
  assert.equal((await (await config({env})).json()).prices.length,11);
  price.livemode=true;
  assert.equal((await (await config({env})).json()).pricingUnavailable,true);
});

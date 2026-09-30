import test from 'node:test';
import assert from 'node:assert/strict';
import {availablePrices,selectPrice,stripePriceMatches} from '../server/pricing.js';
import {onRequestGet as config} from '../functions/api/config.js';
import {onRequestPost as checkout} from '../functions/api/checkout.js';

function environment(writes=[]) {
  return {DB:{prepare(sql){return {bind(...args){return {run:async()=>{writes.push({sql,args});return {};}};}};}},PHOTOS:{},
    STRIPE_PRICE_ID:'price_gbp',STRIPE_PRICE_ID_ZAR:'price_zar',STRIPE_SECRET_KEY:'sk_live_example',
    STRIPE_WEBHOOK_SECRET:'whsec_example',PAYMENT_MODE:'live',LIVE_PAYMENTS_ENABLED:'true',
    TURNSTILE_SECRET:'secret',TURNSTILE_SITE_KEY:'public',APP_ORIGIN:'https://howitwas.co'};
}

test('only configured currencies can select a server-defined price',()=>{
  const env=environment();
  assert.equal(selectPrice(env).amount,499);
  assert.deepEqual(selectPrice(env,'zar'),{currency:'zar',amount:9900,label:'R99',id:'price_zar'});
  assert.equal(selectPrice(env,'usd'),null);
  delete env.STRIPE_PRICE_ID_ZAR;
  assert.equal(selectPrice(env,'zar'),null);
  assert.equal(availablePrices(env).length,1);
});

test('public config suggests configured ZAR in South Africa without exposing Stripe IDs',async()=>{
  const env=environment(),request=new Request('https://howitwas.co/api/config',{headers:{'CF-IPCountry':'ZA'}});
  const result=await (await config({env,request})).json();
  assert.equal(result.defaultCurrency,'zar');
  assert.equal(result.prices[1].amount,9900);
  assert.equal('id' in result.prices[1],false);
  delete env.STRIPE_PRICE_ID_ZAR;
  assert.equal((await (await config({env,request})).json()).defaultCurrency,'gbp');
});

test('live price verification rejects wrong amounts, currency, mode and subscriptions',()=>{
  const expected=selectPrice(environment(),'zar');
  const price={livemode:true,active:true,type:'one_time',currency:'zar',unit_amount:9900};
  assert.equal(stripePriceMatches(price,expected,true),true);
  for(const change of [{unit_amount:99},{currency:'gbp'},{livemode:false},{active:false},{type:'recurring'}])
    assert.equal(stripePriceMatches({...price,...change},expected,true),false);
});

test('checkout charges the selected fixed price and refuses unconfigured or mismatched prices',async t=>{
  const writes=[],env=environment(writes);
  let priceAmount=9900,sessionCalls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('turnstile'))return Response.json({success:true});
    if(String(url).includes('/prices/')) {
      assert.equal(String(url),'https://api.stripe.com/v1/prices/price_zar?expand[]=currency_options');
      return Response.json({livemode:true,active:true,type:'one_time',currency:'zar',unit_amount:priceAmount});
    }
    sessionCalls++;
    const form=new URLSearchParams(options.body);
    assert.equal(form.get('line_items[0][price]'),'price_zar');
    assert.equal(form.get('currency'),'zar');
    assert.equal(form.get('adaptive_pricing[enabled]'),'false');
    assert.equal(form.get('line_items[0][quantity]'),'1');
    assert.match(form.get('cancel_url'),/currency=zar$/);
    return Response.json({id:'cs_live_example',url:'https://checkout.stripe.com/c/pay/example'});
  });
  const request=currency=>new Request(env.APP_ORIGIN+'/api/checkout',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({vehicle:{registration:'ABC',make:'Test',model:'Car'},currency,amount:1,priceId:'price_attacker',turnstileToken:'token'})});
  assert.equal((await checkout({env,request:request('zar')})).status,200);
  assert.equal(sessionCalls,1);
  writes.length=0;
  priceAmount=1;
  assert.equal((await checkout({env,request:request('zar')})).status,503);
  assert.equal(writes.length,0);
  assert.equal(sessionCalls,1);
  assert.equal((await checkout({env,request:request('usd')})).status,400);
  delete env.STRIPE_PRICE_ID_ZAR;
  assert.equal((await checkout({env,request:request('zar')})).status,400);
});


test('multi-currency price validates the exact selected currency amount',()=>{
  const expected=selectPrice(environment(),'zar');
  const price={livemode:true,active:true,type:'one_time',currency:'gbp',unit_amount:499,currency_options:{zar:{unit_amount:9900}}};
  assert.equal(stripePriceMatches(price,expected,true),true);
  assert.equal(stripePriceMatches({...price,currency_options:{zar:{unit_amount:99}}},expected,true),false);
  assert.equal(stripePriceMatches({...price,currency_options:{}},expected,true),false);
  assert.equal(stripePriceMatches(price,expected,false),false);
});

test('checkout supports the same price ID for GBP and its ZAR currency option',async t=>{
  const env=environment();
  env.STRIPE_PRICE_ID_ZAR=env.STRIPE_PRICE_ID;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('turnstile')) return Response.json({success:true});
    if(String(url).includes('/prices/')) {
      assert.equal(String(url),'https://api.stripe.com/v1/prices/price_gbp?expand[]=currency_options');
      return Response.json({livemode:true,active:true,type:'one_time',currency:'gbp',unit_amount:499,currency_options:{zar:{unit_amount:9900}}});
    }
    const form=new URLSearchParams(options.body);
    assert.equal(form.get('line_items[0][price]'),'price_gbp');
    assert.equal(form.get('currency'),'zar');
    return Response.json({id:'cs_live_example',url:'https://checkout.stripe.com/c/pay/example'});
  });
  const request=new Request(env.APP_ORIGIN+'/api/checkout',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({vehicle:{registration:'ABC',make:'Test',model:'Car'},currency:'zar',turnstileToken:'token'})});
  assert.equal((await checkout({env,request})).status,200);
});

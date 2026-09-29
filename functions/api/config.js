import {configured,json,paymentMode} from '../../server/records.js';
import {availablePrices} from '../../server/pricing.js';
export function onRequestGet({env,request}) {
  const onlineRecords=configured(env);
  const prices=onlineRecords?availablePrices(env).map(({id,...price})=>price):[];
  const country=request?.cf?.country || request?.headers.get('CF-IPCountry');
  const defaultCurrency=country==='ZA' && prices.some(p=>p.currency==='zar')?'zar':'gbp';
  return json({onlineRecords,turnstileSiteKey:onlineRecords?env.TURNSTILE_SITE_KEY:null,paymentMode:onlineRecords?paymentMode(env):null,prices,defaultCurrency});
}

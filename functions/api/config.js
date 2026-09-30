import {configured,json,paymentMode} from '../../server/records.js';
import {loadPrices,defaultCurrency} from '../../server/pricing.js';
export async function onRequestGet({env,request}) {
  const onlineRecords=configured(env);
  let prices=[],pricingUnavailable=false;
  if (onlineRecords) {
    try { prices=await loadPrices(env,paymentMode(env)==='live'); }
    catch { pricingUnavailable=true; }
  }
  const country=request?.cf?.country || request?.headers.get('CF-IPCountry');
  return json({onlineRecords,turnstileSiteKey:onlineRecords?env.TURNSTILE_SITE_KEY:null,paymentMode:onlineRecords?paymentMode(env):null,
    prices:prices.map(({id,...price})=>price),defaultCurrency:defaultCurrency(prices,country),pricingUnavailable});
}

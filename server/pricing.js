const currencies = ['gbp','zar','usd','eur','aud','cad','nzd','sgd','aed','chf','inr'];
const prefixes = {gbp:'£',zar:'R',usd:'US$',eur:'€',aud:'A$',cad:'C$',nzd:'NZ$',sgd:'S$',aed:'AED ',chf:'CHF ',inr:'₹'};
const countries = {GB:'gbp',ZA:'zar',US:'usd',AU:'aud',CA:'cad',NZ:'nzd',SG:'sgd',AE:'aed',CH:'chf',LI:'chf',IN:'inr'};
for (const country of ['AT','BE','CY','DE','EE','ES','FI','FR','GR','HR','IE','IT','LT','LU','LV','MT','NL','PT','SI','SK']) countries[country]='eur';

// Stripe is the source of truth for fixed amounts. Only configured currency
// options on this one Price are offered; request-supplied amounts/IDs are ignored.
export function availablePrices(env, price, live) {
  if (!env.STRIPE_PRICE_ID || !price || price.livemode!==live || price.active!==true || price.type!=='one_time' ||
      price.billing_scheme!=='per_unit' || price.transform_quantity || price.custom_unit_amount) return [];
  return currencies.flatMap(currency=>{
    const option=currency===price.currency ? price : price.currency_options?.[currency];
    if (!option || option.custom_unit_amount || !Number.isSafeInteger(option.unit_amount) || option.unit_amount<=0) return [];
    const amount=option.unit_amount;
    const formatted=new Intl.NumberFormat('en-GB',{minimumFractionDigits:amount%100 ? 2 : 0,maximumFractionDigits:2}).format(amount/100);
    return [{currency,amount,label:prefixes[currency]+formatted,id:env.STRIPE_PRICE_ID}];
  });
}

export async function loadPrices(env, live) {
  const response=await fetch('https://api.stripe.com/v1/prices/'+encodeURIComponent(env.STRIPE_PRICE_ID)+'?expand[]=currency_options',{
    headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY}
  });
  if (!response.ok) throw Error('Stripe pricing unavailable');
  const prices=availablePrices(env,await response.json(),live);
  if (!prices.length) throw Error('No supported fixed currency prices');
  return prices;
}

export function selectPrice(prices, currency='gbp') {
  return prices.find(price=>price.currency===currency) || null;
}

export function defaultCurrency(prices, country) {
  const preferred=countries[country];
  return (prices.find(price=>price.currency===preferred) || prices.find(price=>price.currency==='gbp') || prices[0])?.currency || 'gbp';
}

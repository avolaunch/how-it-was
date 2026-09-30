const definitions = [
  {currency:'gbp',amount:499,label:'£4.99',setting:'STRIPE_PRICE_ID'},
  {currency:'zar',amount:9900,label:'R99',setting:'STRIPE_PRICE_ID_ZAR'}
];

export function availablePrices(env) {
  return definitions.filter(price=>env[price.setting]).map(({setting,...price})=>({...price,id:env[setting]}));
}

export function selectPrice(env, currency = 'gbp') {
  return availablePrices(env).find(price=>price.currency===currency) || null;
}

export function stripePriceMatches(price, expected, live) {
  if (!expected || price.livemode!==live || price.active!==true || price.type!=='one_time') return false;
  const amount = price.currency===expected.currency ? price.unit_amount : price.currency_options?.[expected.currency]?.unit_amount;
  return amount===expected.amount;
}

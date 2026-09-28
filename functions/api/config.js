import {configured,json,paymentMode} from '../../server/records.js';
export function onRequestGet({env}) {
  const onlineRecords=configured(env);
  return json({onlineRecords,turnstileSiteKey:onlineRecords?env.TURNSTILE_SITE_KEY:null,paymentMode:onlineRecords?paymentMode(env):null});
}

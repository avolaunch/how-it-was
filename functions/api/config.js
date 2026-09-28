import {configured,json} from '../../server/records.js';
export function onRequestGet({env}) {
  return json({onlineRecords:configured(env),turnstileSiteKey:configured(env)?env.TURNSTILE_SITE_KEY:null});
}

import {removeExpired} from '../server/retention.js';

export default {
  async scheduled(_event, env, context) {
    context.waitUntil(removeExpired(env));
  }
};

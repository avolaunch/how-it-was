# How It Was

A static Astro site with a guided vehicle condition walkthrough. The basic draft remains entirely in the visitor's browser: text in localStorage and photos in IndexedDB. It can be printed or saved as a PDF using the browser's print dialog.

An **opt-in Stripe test-mode online record path** is included as Pages Functions. It requires Cloudflare D1, a private R2 bucket, Turnstile, and Stripe test keys. Without all bindings and settings, it is hidden and the local walkthrough continues to work. Live charging also requires a separate, explicit enable flag and the launch work listed below; it is currently disabled.

## Run the static site locally

```bash
npm ci
npm run dev
npm run build
```

The existing Cloudflare Pages project builds with command `npm run build`, output `dist`, and repository root `/`. The `functions/` directory is picked up by Pages Git deployments. Astro's local development server does not run Pages Functions, so the online-record action stays hidden in that mode.

## Online record architecture

1. The visitor completes all eight exterior photos in the local walkthrough.
2. A Turnstile-verified request creates a pending record in D1 and a Stripe **test-mode** Checkout Session for a one-time price.
3. Stripe's signed webhook marks the record paid. The return page then uploads each original image through authenticated Pages Functions to a **private** R2 bucket.
4. D1 stores photo metadata and SHA-256 digests. Finalization requires all eight views, writes a JSON manifest to R2, and records its digest and a server receipt time in D1.
5. A secret access link opens the saved record. The browser fetches private photos and can print or save the record as a PDF.

The access link is a bearer secret. Anyone with the complete link can view the record. There is no account or automated email recovery. The owner can delete a record using the private link; records become inaccessible one calendar year after finalization. A separate scheduled Worker must be deployed to remove expired D1 rows and R2 objects. The manifest is a server receipt and integrity reference, **not** an independent verification of photo capture time, location, or responsibility. Do not enable live payments until scheduled deletion, recovery, privacy terms, and support handling are configured and tested.

## Configure the test path in Cloudflare

1. In Cloudflare, enable an R2 subscription, create a **Standard storage** bucket such as `how-it-was-private`, and leave public access disabled. R2 has included free monthly usage, but can bill above it.
2. Create a D1 database such as `how-it-was`. Run the SQL in `db/0001_records.sql` in D1's console.
3. In the existing Pages project, go to **Settings → Bindings** and add a **D1 database** binding named `DB` and an **R2 bucket** binding named `PHOTOS`. Add them to the environment you are testing and redeploy.
4. Create a Cloudflare Turnstile widget for the test domain. Configure its allowed hostname. Save its site key and secret.
5. In Stripe **test mode**, create a one-time product/price. Create a webhook endpoint at `https://YOUR-HOST/api/stripe-webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its signing secret.
6. In Pages **Settings → Variables and Secrets**, configure the following for the matching deployment environment, then redeploy:

| Name | Value |
| --- | --- |
| `APP_ORIGIN` | Exact origin used for the test, e.g. `https://example.pages.dev`, without trailing slash |
| `TURNSTILE_SITE_KEY` | Public Turnstile site key |
| `TURNSTILE_SECRET` | Secret Turnstile key |
| `STRIPE_SECRET_KEY` | Stripe **test** secret key beginning `sk_test_` |
| `STRIPE_PRICE_ID` | One-time Stripe **test** price ID |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this exact webhook endpoint |

Use Cloudflare secret variables for the three secret values. Do not commit credentials. The online action appears only when every value and binding is present. Test keys enable only test checkout; a live key also requires `PAYMENT_MODE=live` and `LIVE_PAYMENTS_ENABLED=true`. Do not set either flag until retention, recovery, support, and customer-facing terms are implemented. Checkout requests are accepted only on `APP_ORIGIN`. Test and live webhook events are accepted only when their mode matches the active key.

Test the whole flow with Stripe test payment details on the configured origin. After checkout, the success page automatically confirms payment and uploads photos from the same browser. Keep that tab open until the private link appears; if interrupted, reopen `/vehicle-transport/complete/` in the original browser to resume without paying again. A paid test session cannot be completed from a different device. Save the private access link after finalization.

## Costs and limits

Static Pages assets are free at ordinary usage. Pages Functions share Workers Free's 100,000-request-per-day quota and 10 ms CPU limit. D1 Free includes 5 GB storage, 5 million rows read/day, and 100,000 rows written/day. R2 Standard includes 10 GB-month of storage, 1 million Class A operations, and 10 million Class B operations per month; excess R2 use is billed. R2 activation has a subscription checkout even though free usage is included. Stripe test mode does not make real charges. Live Stripe processing would have transaction fees. Original photos can quickly consume the 10 GB R2 allowance, so monitor storage before inviting broad usage.

The browser PDF costs no server processing. It is a summary of what is shown in the browser, not a signed or independently sealed PDF. A server-rendered image-heavy PDF is deliberately out of scope for the Workers Free CPU and memory budget.

## Next steps before a real paid launch

- The proposed first price is **£4.99 per vehicle record**, with **12 months of online access**. Access expiry is enforced in code; the Stripe price and cleanup Worker are not yet live.
- The support address is `support@howitwas.co`. Confirm forwarding continues to work, and decide how refunds will be handled.
- A customer with the private link can permanently delete the record and photos. Support can rotate a lost link after verifying the requester against Stripe (instructions below).
- Add operational cleanup of abandoned payment sessions and orphaned uploads.
- Test Cloudflare bindings, Stripe webhook delivery, mobile upload interruptions, and PDF output on real devices.
- Review copy and terms so a server receipt is never described as a verified capture time or proof of liability.
- Create a live Stripe price and webhook endpoint, update the Cloudflare secrets, and set the two live enable variables only after the customer support and retention paths above are working.

## Retention and manual support recovery

The Pages code denies access after one calendar year from finalization. To physically remove expired records, deploy the separate Worker in `workers/retention.js` with the **same D1 database and private R2 bucket** bound as `DB` and `PHOTOS`. Copy `workers/wrangler.example.toml` to `workers/wrangler.toml`, replace the database ID and bucket name, then deploy with Wrangler using that config. The daily trigger processes up to 20 expired records per run; monitor the Worker logs and increase frequency if volume grows. Until this Worker is deployed, expired data stays stored even though links stop working.

For manual recovery, add a long random `RECOVERY_ADMIN_SECRET` as a Cloudflare Pages **secret**. A support operator must verify that the request really came from the payer (for example, by replying to the address used at Checkout and checking the record ID in Stripe's metadata). Open `/admin/recover/`, enter the record ID, the email used at checkout, and the admin secret. The server fetches that Checkout Session from Stripe and checks its paid status, mode, record ID, and email before rotating the access token. Copy the new private link and send it to the verified payer; the old link stops working. The form does not save the secret. If Stripe does not have the customer's email, the recovery operation refuses to rotate the link.

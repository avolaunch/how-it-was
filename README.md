# How It Was

A static Astro site with a guided vehicle condition walkthrough. The basic draft remains entirely in the visitor's browser: text in localStorage and photos in IndexedDB. It can be printed or saved as a PDF using the browser's print dialog.

An **opt-in Stripe test-mode online record path** is included as Pages Functions. It requires Cloudflare D1, a private R2 bucket, Turnstile, and Stripe test keys. Without all bindings and settings, it is hidden and the local walkthrough continues to work. This code does not accept live Stripe charges.

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

The access link is a bearer secret. Anyone with the complete link can view the record. There is no account, email recovery, expiry, automatic retention or deletion policy in this test release. The manifest is a server receipt and integrity reference, **not** an independent verification of photo capture time, location, or responsibility. Do not enable live payments until recovery, retention, privacy terms, and support handling are designed and tested.

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

Use Cloudflare secret variables for the three secret values. Do not commit credentials. The online action appears only when every value and binding is present and the Stripe key starts with `sk_test_`. Checkout requests are accepted only on `APP_ORIGIN`.

Test the whole flow with Stripe test payment details on the configured origin. After checkout, the success page automatically confirms payment and uploads photos from the same browser. Keep that tab open until the private link appears; if interrupted, reopen `/vehicle-transport/complete/` in the original browser to resume without paying again. A paid test session cannot be completed from a different device. Save the private access link after finalization.

## Costs and limits

Static Pages assets are free at ordinary usage. Pages Functions share Workers Free's 100,000-request-per-day quota and 10 ms CPU limit. D1 Free includes 5 GB storage, 5 million rows read/day, and 100,000 rows written/day. R2 Standard includes 10 GB-month of storage, 1 million Class A operations, and 10 million Class B operations per month; excess R2 use is billed. R2 activation has a subscription checkout even though free usage is included. Stripe test mode does not make real charges. Live Stripe processing would have transaction fees. Original photos can quickly consume the 10 GB R2 allowance, so monitor storage before inviting broad usage.

The browser PDF costs no server processing. It is a summary of what is shown in the browser, not a signed or independently sealed PDF. A server-rendered image-heavy PDF is deliberately out of scope for the Workers Free CPU and memory budget.

## Next steps before a real paid launch

- Set a clear price, storage period, deletion and refund policy.
- Add a recovery method (email or account) and a way to request deletion.
- Add operational cleanup of abandoned payment sessions and orphaned uploads.
- Test Cloudflare bindings, Stripe webhook delivery, mobile upload interruptions, and PDF output on real devices.
- Review copy and terms so a server receipt is never described as a verified capture time or proof of liability.

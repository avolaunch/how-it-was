# How It Was

A static Astro site and browser-only guided vehicle condition walkthrough. It is designed to deploy from GitHub to Cloudflare Pages on the Free plan. The draft stores text in localStorage and photos in IndexedDB on the visitor's device. It sends no customer data to a server and does not claim to produce a verified or preserved evidence record.

## Run locally

```bash
npm ci
npm run dev
npm run build
```

## Publish to Cloudflare Pages

1. Create a GitHub repository, for example `avolaunch/how-it-was`, and push this project **with the contents of this folder at the repository root**.
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**; select the repository.
3. Framework preset: **Astro**. Build command: `npm run build`. Output directory: `dist`. Root directory: `/`.
4. After the first successful deployment, add `howitwas.co` as a custom domain in the Pages project and follow the DNS instructions Cloudflare gives for the domain. Cloudflare provisions HTTPS.
5. Check the home page, `/vehicle-transport/`, and `/vehicle-transport/capture/` on a phone before sharing the site.

No D1, R2, Worker, payment or email account is required for this first release. Hosting the static site is within the Pages Free plan limits at ordinary early usage. Domain renewal is separate. Google Fonts are requested from the visitor's browser; self-host them later if tighter privacy control is required.

## What the walkthrough does

- Collects vehicle and planned collection details.
- Guides eight exterior photographs, offers four optional detail photographs, and records existing marks.
- Saves the draft and photos locally so a browser reload can resume it.
- Shows a review and offers the browser's print dialog for a draft summary.

The user should keep the original photos separately. Browser storage can be cleared or evicted, and drafts do not transfer to another device. A printed summary is not a sealed evidence package.

## Next product milestone

The next milestone is a private server-backed record with D1 metadata, R2 originals, authenticated access, server receipt timestamps, and a reproducible manifest. Only then should the site offer paid sealing, durable storage, private sharing or email recovery. Keep payment provider and email service choices out of the static build until real usage validates the capture flow.

The earlier schema and template specification are in the separate `proof-starter.zip` artifact. They are design input, not yet deployed backend code.

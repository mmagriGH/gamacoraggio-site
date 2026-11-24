# Cloudflare setup — EnduroStrength Garmin (GamaCoraggio LLC)

**Safe first stage: PREVIEW only. Do not merge the GitHub draft PR or turn on Garmin API push delivery yet.**

## Current Cloudflare Pages project

The existing website GitHub repository is `mmagriGH/gamacoraggio-site`, production branch is `main`, and the site is `https://gamacoraggio.com`. It is a framework-free static site without a build command. GitHub feature branch: `feature/endurostrength-2-garmin-backend` (draft PR #7).

Do **not** create or commit a new `wrangler.jsonc` yet: Cloudflare warns that it can become the entire source of truth for existing Pages settings, potentially overriding configuration made in the dashboard. Use the existing Cloudflare dashboard initially.

## Stage A — create D1 database for PREVIEW

1. Log into Cloudflare at https://dash.cloudflare.com/ (do not share credentials in screenshots or chat).
2. Open the account containing the `gamacoraggio.com` Pages project.
3. Navigate to **Workers & Pages**, then **D1 SQL database** (some accounts show **Storage & databases → D1**).
4. Select **Create database**. Name it `endurostrength-garmin-preview`. Choose a data location suitable for the expected users and applicable data obligations. Create it.
5. Open that database's **Console / SQL editor**. Copy and run the full SQL from `garmin/schema.sql` on this feature branch. Alternatively, with Wrangler authenticated locally, from the repo root:

   `npx wrangler d1 execute endurostrength-garmin-preview --remote --file=garmin/schema.sql`

6. In the SQL editor, verify the four tables exist with a query similar to:

   `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'garmin_%' ORDER BY name;`

   Expected: `garmin_activities`, `garmin_connections`, `garmin_health`, `garmin_oauth_flows`.

## Stage B — bind database to Pages PREVIEW environment

1. Navigate to **Workers & Pages → your existing GamaCoraggio Pages project → Settings → Bindings**.
2. Switch to **Preview** environment. Select **Add → D1 database**.
3. Set binding variable name **exactly** `GARMIN_DB` and choose `endurostrength-garmin-preview`.
4. Save. Cloudflare requires a **redeploy** for new bindings to take effect.
5. Under **Settings → Variables and Secrets → Preview**, add a plain environment variable `GARMIN_INTEGRATION_ENABLED` = `false` (no quotes in the dashboard). **Do not add the Garmin client secret during this first stage.**
6. Open the Pages **Deployments** tab and verify the feature branch has a successful **Preview** deployment. If preview deployments are off, enable previews for this feature branch only. Use its `*.pages.dev` preview URL.
7. Check the preview endpoint:

   `https://<preview-host>.pages.dev/endurostrength/api/garmin/healthcheck`

   The expected response after this feature branch redeploys is HTTP 503 with JSON `{"service":"endurostrength-garmin","status":"disabled","database":"ready"}`. This confirms both the D1 binding and four tables while the feature flag still protects the integration. `"database":"incomplete"` means a required table is missing; `"database":"unavailable"` suggests the D1 binding or SQL query failed. A 404 means the function did not deploy or routing is wrong.

## Stage C — production preparations, later

Only after the preview test and a security review:

- Create a separate `endurostrength-garmin-production` D1 database and bind it to **Production** as `GARMIN_DB`. Apply the schema to **production** only when explicitly ready.
- Add the following as **encrypted Secrets** under Cloudflare Pages **Production** (never in GitHub/iOS/screenshots): `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_ENCRYPTION_KEY_B64` (base64 of exactly 32 random bytes), and `GARMIN_WEBHOOK_TOKEN` (at least 40 cryptographically random URL-safe characters). Use a password manager, not chat, to transfer sensitive values. Never reuse preview data keys in production.
- Retain `GARMIN_INTEGRATION_ENABLED=false` until the official Garmin callback, push authentication, logging redaction, privacy disclosures, consent, revocation and retention checks pass. Do not enable preview with production credentials.
- The OAuth redirect registered in Garmin is `https://gamacoraggio.com/endurostrength/oauth/garmin/callback`. A `pages.dev` preview URL cannot exercise the real browser callback without an approved Garmin redirect change.
- Garmin's push URL cannot be enabled before the verified production domain and webhook security are active. **Do not put the webhook token URL in screenshots, support tickets, analytics, or logs.** The current secret-in-query approach requires special logging protections and a further security review.
- Audit Garmin's accepted push payload shape against the licensed Activity and Health API documentation. The existing code intentionally implements only conservative field mapping.
- Update the production privacy policy to clearly name Cloudflare and other actual processors, personal-data retention and accessible user deletion before collecting any user Garmin data. Garmin's developer agreement requires prior disclosure of technology vendors and consent.

## Safe defaults

No credentials are stored in repository files or in the iPhone application. Database, secrets and feature flag are injected as Cloudflare bindings. Garmin production OAuth and API push traffic remain disabled throughout Stages A and B.

## References
- Cloudflare Pages bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Pages dashboard/config distinction: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Cloudflare Pages Git preview: https://developers.cloudflare.com/pages/configuration/git-integration/

# EnduroStrength 2.0 Garmin backend — preproduction

These Cloudflare Pages Functions are intentionally isolated on a feature branch.
They are NOT deployed, and no live Garmin data is collected until Cloudflare
bindings, user consent, privacy disclosures, and Garmin event tests are verified.

## Endpoints
- POST /endurostrength/oauth/garmin/start (device bearer) => Garmin OAuth URL
- GET /endurostrength/oauth/garmin/callback (Garmin redirect) => stores encrypted tokens
- GET /endurostrength/api/garmin/status (device bearer) => connection status
- GET /endurostrength/api/garmin/context (device bearer) => minimal 7-day data and deterministic guidance
- POST /endurostrength/api/garmin/disconnect (device bearer) => revokes registration then deletes all linked device records and Garmin data
- POST /endurostrength/api/garmin/push?key=SECRET (Garmin push) => normalized activity and selected health records
- POST /endurostrength/api/garmin/workout-preview (device bearer) => validates proposal; does NOT publish to Garmin

## Cloudflare Pages setup, once code is reviewed
1. Do not merge the branch into main before Cloudflare secrets and database are ready.
2. Create a Cloudflare D1 database (suggested name: endurostrength-garmin). Bind it
   as GARMIN_DB to GamaCoraggio's Cloudflare Pages project, for preview and production
   environments as appropriate. Run schema.sql against the correct D1 database.
   Example: npx wrangler d1 execute endurostrength-garmin --remote --file=garmin/schema.sql
3. Under Cloudflare Pages -> Settings -> Variables and Secrets, supply:
   GARMIN_CLIENT_ID (Garmin's issued client ID)
   GARMIN_CLIENT_SECRET (private; NEVER commit or share)
   GARMIN_ENCRYPTION_KEY_B64 (32 random bytes encoded as base64, e.g. openssl rand -base64 32)
   GARMIN_WEBHOOK_TOKEN (64 random hex characters, e.g. openssl rand -hex 32)
   GARMIN_INTEGRATION_ENABLED = true (only after all prerequisites)
   Do not include secrets in repository, app binary, support emails, screenshots or AI prompts.
4. Keep the exact registered OAuth redirect:
   https://gamacoraggio.com/endurostrength/oauth/garmin/callback
   A Cloudflare preview domain cannot test browser OAuth using a different redirect
   without a separate Garmin-approved callback.
5. Configure in Garmin API Tools the Activity and Health *push*, not ping/pull, notification
   URL: https://gamacoraggio.com/endurostrength/api/garmin/push?key=<GARMIN_WEBHOOK_TOKEN>
   The token must not enter logs, browser history, analytics, or support tickets. Enable
   WAF rate limiting and verify available Garmin IP-origin authentication controls.
   Confirm event names and payload fields against the permitted Garmin documentation.
6. Before live data, publish privacy disclosure identifying the actual backend provider,
   retention period, optional per-user permission, deletion route, and any processors.
   Cloudflare is the anticipated backend provider; check applicable Garmin vendor approval.
   Complete a real consent, push, refresh, disconnect, permission revocation and
   multi-device authorization test with only consenting test users.
7. After disconnect confirm Garmin's user registration has been revoked via Garmin's
   DELETE user/registration endpoint, and that all related device links and imported data are deleted.

## Security architecture
- iOS creates a high-entropy, device-only Keychain token. Requests carry it in the
  Authorization bearer header; database stores only its SHA-256 hash.
- Garmin OAuth 2.0 S256 PKCE state is random, expires in 10 minutes and is single-use.
- Garmin client secret, encryption key, refresh tokens and access tokens are not sent
  to the iOS app or written in source. Tokens are encrypted with AES-256-GCM.
- API data is minimized into typed activity and health tables (not raw FIT/GPS streams).
- Unknown Garmin event types are ignored, and callback URLs in payloads are not fetched.
- Only explicitly authorized Garmin users are eligible for inbound push storage.
- Existing manual workouts always remain functional without Garmin.
- No Garmin data or derived metrics may enter AI prompts, model evaluation, learning,
  analytics SDKs, or third-party coaching services without Garmin's written permission.
- Uninstalling the app does not automatically revoke Garmin consent. Users must be
  offered an accessible disconnect route and data-subject deletion support.
- Local installation tokens are not user accounts; before multi-device/cloud sync,
  an actual cross-device identity model and per-user privacy design are required.

## Limitations requiring further testing
- The webhook summary fields here are a conservative mapping. Verify against Garmin
  Activity API 2.1 and Health API 2.1 examples accessible to the licensed developer.
- Activity volume is not physiological training intensity. The current deterministic
  adapter offers caution only, not a recovery diagnosis or medical readiness score.
- Live Training API V2 workout publishing is deliberately NOT enabled. Workout-preview
  validates human-readable steps only; implement Garmin's exact supported workout
  schema and obtain any needed approval before enabling a submit endpoint.
- Starter access is push-only and lacks historical backfill. No scraped Garmin endpoints.
- Cloudflare deployment, Garmin production approval, simulator and device testing,
  and retention/privacy validations are not yet complete.

## Unit test command
In the garmin/ directory: npm test
Requires Node 22+. Uses fake test credentials and no Garmin network access.

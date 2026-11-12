# GamaCoraggio corporate site

Static website deployed at https://gamacoraggio.com using Cloudflare Pages.

## Site files

- `index.html` — GamaCoraggio homepage and iOS app portfolio
- `privacy.html` — corporate/privacy notice and app-specific policy links
- `styles.css` — shared styles
- `endurostrength/index.html` — EnduroStrength 1.0 product/marketing page
- `endurostrength/support/index.html` — EnduroStrength support and FAQ
- `endurostrength/privacy/index.html` — EnduroStrength 1.0 privacy policy
- `endurostrength/terms/index.html` — EnduroStrength 1.0 Terms of Use
- `puzzlento/index.html` — Puzzlento product page
- `puzzlento/privacy/index.html` — Puzzlento privacy policy
- `puzzlento/support/index.html` — Puzzlento support

## App Store Connect — EnduroStrength

Use these production URLs only after checking the site deployment and HTTPS:

- Marketing: https://gamacoraggio.com/endurostrength/
- Support: https://gamacoraggio.com/endurostrength/support/
- Privacy Policy: https://gamacoraggio.com/endurostrength/privacy/
- Terms: https://gamacoraggio.com/endurostrength/terms/

EnduroStrength Pro purchases use Apple StoreKit. Its v1.0 analytics are disabled by default until opt-in. Do **not** claim that Apple Health, Garmin, iCloud training sync, Strava or TrainingPeaks integrations are active.

## Cloudflare Pages settings

- Framework preset: None
- Build command: leave blank
- Build output directory: leave blank
- Production branch: `main`
- Canonical domain: https://gamacoraggio.com
- `www.gamacoraggio.com` should redirect to the root domain.

## Other product site

EnduroPace is hosted separately: https://enduropace.gamacoraggio.com

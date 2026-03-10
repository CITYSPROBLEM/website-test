# Deploy Cache Checklist (GitHub Pages)

This site currently deploys via GitHub Actions to GitHub Pages (`.github/workflows/static.yml`).

## Important constraint
- GitHub Pages does not support per-file custom cache headers (for example, `Cache-Control: immutable` on assets and short TTL on HTML).
- Because of that, strict header-level tuning is not available in this repo alone.

## What is implemented in this repo
- Versioned static file URLs in `index.html`:
  - `styles.css?v=20260309`
  - `script.js?v=20260309`
  - `SONGS/tracks.js?v=20260309`
- This ensures stale browser cache is bypassed immediately when the version changes.

## Release checklist
1. If `styles.css`, `script.js`, or `SONGS/tracks.js` changed, bump the `v=` value in `index.html`.
2. Push to `main` and wait for GitHub Pages deploy to finish.
3. Open the live site with a hard refresh (`Cmd+Shift+R`) and verify:
   - latest CSS is loaded
   - latest JS behavior is loaded
   - latest track list is loaded
4. If something still appears stale, open DevTools Network and confirm `?v=` value in requested URLs matches the latest deploy.

## If you want full cache-control headers
Move behind a platform that supports custom headers (Cloudflare, Netlify, Vercel, Nginx, etc.) and configure:
- HTML: `Cache-Control: public, max-age=0, must-revalidate`
- CSS/JS/Images/Audio (fingerprinted files): `Cache-Control: public, max-age=31536000, immutable`

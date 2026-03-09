# Gate Codes PWA

GitHub-ready gate code lookup app with:

- one-tap gate code copying
- property type filters
- recent copied codes
- Apple Maps quick-open links
- offline service worker support
- JSON cleaner script for merging duplicate community entries
- code override fallback by community or community+address
- build report to catch unmatched overrides and multi-address communities

## Files

- `index.html` — main app UI
- `data.json` — source community data
- `overrides.json` — rename, type, address, and code overrides
- `build-clean-data.js` — builds `data.cleaned.json`
- `build-report.json` — shows unmatched code overrides and multi-address communities
- `data.cleaned.json` — cleaned app data used by the UI
- `manifest.json` — PWA manifest
- `sw.js` — service worker
- `.nojekyll` — helps GitHub Pages serve the app cleanly

## Build the cleaned data

```bash
node build-clean-data.js
```

Or:

```bash
npm run build:data
```

## Run locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

1. Upload all files to your repo root.
2. In GitHub, go to **Settings → Pages**.
3. Set source to **Deploy from a branch**.
4. Choose your main branch and `/root`.
5. Save and wait for Pages to publish.

## Override tips

`codes` supports either of these keys:

```json
{
  "codes": {
    "Cherry Park Studios|222 S Cherry Ave, Tucson": "1210",
    "Vistoso Vistas": "1559, 2355"
  }
}
```

Exact `community|address` matches win first. Community-only matches are used as fallback.

## Notes

- `data.json` is still a starter sample. Replace it with your full dataset.
- Re-run the cleaner every time you update `data.json` or `overrides.json`.
- The app reads `data.cleaned.json`, not `data.json` directly.
- Check `build-report.json` after each build so you can catch bad override keys quickly.

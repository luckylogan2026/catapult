# Catapult

A personal transformation board. An authoring tool and a playback tool in one: build a board of pages holding images, video, text, and audio on the desktop, then swipe through it on a phone every morning and every night. Installable PWA, fully offline, no accounts, no telemetry.

The product name, palette, and fonts live in `config/brand.json`. All UI copy lives in `config/strings.json`. Nothing user-facing is hardcoded in source, because client copies of this app may ship under a different name.

## Development

```
npm install
npm run dev       # dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Deployment

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`. The Vite base path is set by the workflow: repo subpath by default, site root when `public/CNAME` exists. To serve a copy from a custom domain, add the domain to `public/CNAME` and configure it in the repo's Pages settings.

One rule from the build brief worth repeating: never leave a `filename.html` in the repo root alongside a `filename/index.html` folder, because GitHub Pages serves the root file and silently ignores the folder.

## Project documents

The build brief lives outside this repo at `Documents/Project Sunshine/Catapult_ClaudeCode_Handoff.md`. Work proceeds in phases; each phase ends with a report and waits for approval.

# Rebranding a client copy

This app is built to be handed to a client as their own deployed copy under their own name. A full rebrand touches configuration files and image assets only. No source edits are required, and if a rebrand ever seems to need one, that is a bug worth reporting.

## What a new client copy requires

### 1. Copy the repository

Fork or duplicate this repository under a new name, for example `sunrise` for a client app called Sunrise. GitHub's "Use this template" or a plain fork both work. Enable GitHub Pages on the new repository: Settings, Pages, Source "GitHub Actions". The deploy workflow ships with the repository and needs no changes; it detects the repository name and the optional custom domain by itself.

### 2. config/brand.json

The identity of the app. Every field matters:

- `appName`: the product name. It appears in the browser tab, the install banner, the home screen icon label, the welcome screen, and names the Google Drive sync folder ("{appName} Board").
- `logoPath`: reserved for a logo asset; leave as is until a logo feature calls for it.
- `defaultThemePreset`: which of the four presets in `src/theme/presets.ts` the app starts with (`sugarpine-forest`, `near-black`, `neutral-dark`, `paper`).
- `palette`: the six brand colors, which override the preset. These drive the whole interface, the PWA install colors, and export backgrounds.
- `fonts`: the heading and body family names. The shipped self-hosted files cover Playfair Display and DM Sans. A different family needs its woff2 files added under `src/assets/fonts/` and `@font-face` entries in `src/theme/fonts.css`; system families from `src/theme/fontChoices.ts` (Georgia, Arial, and friends) need nothing.

### 3. config/strings.json

Every word of user-facing copy lives here: buttons, labels, prompts, page type names, template names, warnings. Rewrite freely in the client's voice. Keep the placeholder tokens like `{size}` and `{pages}` intact where they appear; the app substitutes values into them.

### 4. config/starter-template.json

The pages a fresh board starts with, and the example affirmations. Tailor the page list and the starter affirmations to the client's practice, or leave the defaults.

### 5. config/sync.json

Google Drive sync. Three choices:

- Leave `googleClientId` empty: sync stays invisible and the app is fully local. Perfectly fine.
- Reuse an existing client id: add the new copy's origin (for example `https://<user>.github.io`) to the Authorized JavaScript origins of that OAuth client in Google Cloud Console.
- Give the client their own free Google Cloud project with its own OAuth client id, for full separation. Steps: enable the Google Drive API, configure the consent screen (External, with the client as a test user until published), create a Web application OAuth client with the copy's origin, and paste the client id here.

Each user always syncs to their own Drive; the client id only identifies the app.

### 6. Icons

`public/icons/` holds `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png`, plus the favicon reference in `index.html` pointing at the 192. Replace them with the client's mark, same sizes, PNG. The shipped ones are generated from the brand initial over the brand background color, so at minimum regenerate them with the new palette and initial.

### 7. Custom domain, optional

Add the domain to `public/CNAME` (one line, the bare domain) and configure the same domain in the repository's Pages settings. The deploy workflow switches the app to serve from the domain root automatically. Remember to add the domain to the OAuth client's origins if sync is on.

## Verification checklist

After deploying, open the copy in a fresh browser and confirm:

- The tab title, welcome screen, and install prompt all show the client's name, and nothing anywhere says the original name.
- The interface wears the client's palette, including the splash background when installed to a phone.
- Setup, adding a page of each type, and Play all read in the client's copy.
- Settings shows sync as configured or absent, as intended.
- A backup exports and restores, and its filename carries the owner's name.

## What deliberately stays shared

The four theme presets keep their names in source; `defaultThemePreset` and the palette override make them a starting point, not a limit. The internal database name, page type identifiers, and file format internals never surface to users and must not be renamed, or existing boards and backups would stop opening.

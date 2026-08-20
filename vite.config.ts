import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import brand from './config/brand.json' with { type: 'json' };
import strings from './config/strings.json' with { type: 'json' };

// The base path is configurable through VITE_BASE so one build recipe
// works at a repo subpath (https://user.github.io/repo/) and at a custom
// domain (base "/"). The deploy workflow sets it per target.
// Build stamp shown in the editor header so a stale service-worker
// cache is visible at a glance (MMDD.HHMM, build machine local time).
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const buildId = `${pad(now.getMonth() + 1)}${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    tailwindcss(),
    {
      // Injects brand values into index.html at build time. The app name
      // must never be hardcoded in source, because client copies of this
      // app ship under a different name. index.html therefore carries
      // placeholders that resolve from config/brand.json.
      name: 'brand-inject',
      transformIndexHtml(html: string) {
        return html
          .replaceAll('{{APP_NAME}}', brand.appName)
          .replaceAll('{{THEME_COLOR}}', brand.palette.background);
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: brand.appName,
        short_name: brand.appName,
        description: strings.shell.tagline,
        theme_color: brand.palette.background,
        background_color: brand.palette.background,
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache every built asset, fonts included, so the installed
        // app opens fully offline. Media never passes through here, it
        // lives in IndexedDB.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});

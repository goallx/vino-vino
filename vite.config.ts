import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable on the tablets (standalone, no browser chrome) and the app
    // shell works offline; live data still needs the network, but the cached
    // localStorage copies keep the screens rendering through a blip.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'וינו וינו · ניהול הזמנות',
        short_name: 'וינו וינו',
        description: 'קבלת הזמנות, מסך מטבח ודוחות — וינו וינו',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        theme_color: '#be241d',
        background_color: '#f8f1e7',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // the Wolt dish photos (jpg) are precached with the shell
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webp,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks are cached across app-only deployments. This
        // also lets lower-end tablets parse the bootstrap in smaller pieces.
        manualChunks(id) {
          if (id.includes('/node_modules/@supabase/')) return 'supabase';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) return 'react';
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});

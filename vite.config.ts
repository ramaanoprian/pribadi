/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png', 'brand/*.png', 'robots.txt'],
      manifest: {
        id: '/',
        name: 'GutVibes Bakehouse',
        short_name: 'GutVibes',
        categories: ['food', 'shopping', 'business'],
        orientation: 'portrait-primary',
        description: 'Pesan kue & roti GutVibes, serta dashboard operasional toko.',
        lang: 'id',
        theme_color: '#F25A0E',
        background_color: '#FFF8EE',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Data Supabase tidak di-cache: selalu ambil yang terbaru.
        navigateFallbackDenylist: [/^\/functions\//, /^\/rest\//, /^\/auth\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
        // Aset statis di-cache; data Supabase selalu dari jaringan.
        globPatterns: ['**/*.{js,css,html,png,svg,webp,jpg,woff2}'],
        // Pustaka ekspor (PDF/Excel) hanya diunduh saat dipakai, tidak ikut dipasang offline.
        globIgnores: ['**/jspdf*', '**/html2canvas*', '**/purify.es*', '**/index.es-*', '**/browser-*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Base path = "/GapViz/" en prod (le repo GitHub s'appelle encore GapViz,
// donc l'URL de déploiement est /GapViz/). L'app elle s'appelle "Star Gap"
// mais on garde le path pour ne pas casser la deploy URL existante. À
// override via VITE_BASE quand on passera sur app.stargap.io.
const base = process.env.VITE_BASE ?? (process.env.NODE_ENV === 'production' ? '/GapViz/' : '/');

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Star Gap — SEO Cluster MindMap',
        short_name: 'Star Gap',
        description: 'Star Gap — visualise les clusters de mots-clés SEO et les gaps concurrentiels.',
        theme_color: '#0a0a1a',
        background_color: '#0a0a1a',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Active la nouvelle version du SW dès qu'elle est téléchargée,
        // sans attendre que toutes les fenêtres ouvertes soient fermées.
        // Sinon l'utilisateur voit l'ancienne UI malgré le déploiement.
        skipWaiting: true,
        clientsClaim: true,
        // Nettoie les anciennes caches au passage.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

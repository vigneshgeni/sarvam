import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globIgnores: ['**/samples/**'],
        navigateFallbackDenylist: [/^\/api\/.*/],
      },
      manifest: {
        name: 'Sarvam',
        short_name: 'Sarvam',
        description: 'Important notices turned into clear next steps in your language',
        theme_color: '#146B4E',
        background_color: '#F6F6F3',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
})

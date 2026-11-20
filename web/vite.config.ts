import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.dirname(fileURLToPath(import.meta.url))
  const env = loadEnv(mode, envDir, '')
  const apiTarget = (env.VITE_API_URL || process.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')
  const isHttps = (env.VITE_RELAY_HTTPS || process.env.VITE_RELAY_HTTPS) === '1'

  return {
  base: '/',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    ...(isHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globIgnores: ['**/samples/**', '**/sample-*', '**/fixtures/**', '**/*fixture*'],
        navigateFallbackDenylist: [/^\/api\/.*/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },

      manifest: {
        name: 'Sarvam',
        short_name: 'Sarvam',
        description: 'Important notices turned into clear next steps in your language',
        theme_color: '#F4F5F2',
        background_color: '#F4F5F2',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
}
})

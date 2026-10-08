import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

// Standalone preview for Lost & Found until P5 wires the tab in App.tsx.
export default defineConfig({
  root,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 43123,
    proxy: {
      '/lf': 'http://127.0.0.1:8100',
    },
  },
})

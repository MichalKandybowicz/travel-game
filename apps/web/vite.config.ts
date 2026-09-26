import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000'
const railwayHost = process.env.RAILWAY_PUBLIC_DOMAIN

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com', ...(railwayHost ? [railwayHost] : [])],
    proxy: {
      '/auth': apiTarget,
      '/custom-maps': apiTarget,
      '/health': apiTarget,
      '/socket.io': {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@game-engine': path.resolve(
        __dirname,
        '../../packages/game-engine/src/index.ts',
      ),
      '@map-generator': path.resolve(
        __dirname,
        '../../packages/map-generator/src/index.ts',
      ),
    },
  },
})

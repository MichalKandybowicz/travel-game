import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
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

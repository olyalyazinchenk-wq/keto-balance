import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /.*(carnivoreDraftRecipes|ketoDraftRecipes|decemberDraftRecipes)(\.ts)?$/,
        replacement: path.resolve(__dirname, 'src/data/emptyDrafts.ts'),
      },
    ],
  },
  envDir: './src/core/env',
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
})

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

if (process.argv.includes('build')) {
  process.env.NODE_ENV = 'production';
}

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  if (isBuild) {
    process.env.NODE_ENV = 'production';
  }
  return {
    mode: isBuild ? 'production' : undefined,
    plugins: [react(), tailwindcss()],
    define: isBuild
      ? {
          'process.env.NODE_ENV': JSON.stringify('production'),
        }
      : undefined,
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

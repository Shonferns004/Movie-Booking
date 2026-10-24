import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  root,
  // Built assets are served by the movie API under /admin.
  base: mode === 'production' ? '/admin/' : '/',
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
}));

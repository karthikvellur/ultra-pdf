import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Vite resolves config-relative paths from the project root.
      '@': path.resolve('src'),
    },
  },
  worker: {
    format: 'es',
  },
});

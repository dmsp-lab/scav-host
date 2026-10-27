import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` proxies the API and media to the Docker stack (Caddy on :8080),
// so you can work on the UI with hot reload while everything else runs in containers.
// Uploads and media still go straight to the stack's URL (presigned for PUBLIC_URL).
const target = process.env.STACK_URL || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: false },
    },
  },
});

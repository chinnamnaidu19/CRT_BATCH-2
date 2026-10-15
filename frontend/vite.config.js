import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The proxy keeps the browser on one origin in development, so the httpOnly cookie just works.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
    },
  },
});

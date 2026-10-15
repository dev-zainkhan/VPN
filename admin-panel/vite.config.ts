import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The panel calls /api on its own origin. In development Vite forwards it to the
// backend; in production Caddy serves the panel and the API on one domain.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});

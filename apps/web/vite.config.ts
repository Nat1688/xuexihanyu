import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the CLP SPA skeleton.
// The API base URL is read from a non-secret public variable name only.
// No database credential or privileged secret is ever exposed to the browser.
export default defineConfig({
  plugins: [react()],
  // Keep development caches local even when worktrees share dependency packages.
  cacheDir: '.vite',
  server: {
    port: 5173,
  },
});

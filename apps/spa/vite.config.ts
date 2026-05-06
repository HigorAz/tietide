/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@tietide/shared', '@tietide/sdk'],
  },
  server: {
    port: 5173,
    headers: {
      // Preserves window.opener for OAuth popups (e.g. Google) that send
      // Cross-Origin-Opener-Policy: same-origin from the provider's consent
      // screen. Without this, the popup → opener postMessage bridge for
      // /connections fails. See docs/deployment.md for the Nginx equivalent.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/v1': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/test-setup.ts',
        '**/*.config.ts',
        '**/*.config.js',
        'dist/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
});

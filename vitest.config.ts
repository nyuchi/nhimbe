import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // `*.integration.test.ts` needs a real MongoDB and runs under
    // vitest.integration.config.ts (`npm run test:integration`). Without this
    // exclusion those files match the glob above and fail here — they have no
    // server, and the unit run has no `server-only` stub for them.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.integration.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/__tests__/**'],
    },
  },
});

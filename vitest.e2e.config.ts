import { defineConfig } from 'vitest/config';

// Tes end-to-end terhadap Supabase lokal yang sedang berjalan (`npx supabase start`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});

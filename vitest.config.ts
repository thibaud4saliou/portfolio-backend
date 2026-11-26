import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // Adaptateurs fins (démarrage du serveur, SMTP réel, CLI) : testés à la main.
      exclude: ['src/index.ts', 'src/lib/mailer.ts', 'src/lib/storage.ts', 'src/cli/**'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'reference/**'],
    // Keep the local verification gate bounded on developer laptops. The
    // suite is contract/unit scoped; parallelism must not compete with the
    // Tauri linker, browser tooling, or Android workers for system memory.
    minWorkers: 1,
    maxWorkers: 2,
  },
});

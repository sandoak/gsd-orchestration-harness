import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests need longer timeouts than unit tests
    testTimeout: 30000,
    hookTimeout: 15000,

    // Run tests sequentially to avoid port conflicts
    // (each test uses random port but concurrent could still race)
    sequence: {
      concurrent: false,
    },

    // Include all test files
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
  },
});

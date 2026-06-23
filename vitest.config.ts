import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});

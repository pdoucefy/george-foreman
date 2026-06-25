import react from '@vitejs/plugin-react';

import { resolve } from 'path';
import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';

export default mergeConfig(
  { plugins: [react()] },
  defineConfig({
    test: {
      globals: true,
      environment: 'happy-dom',
      include: ['src/renderer/**/*.test.tsx', 'src/renderer/**/*.test.ts'],
      setupFiles: ['src/renderer/__tests__/setup.ts'],
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@shared/types': resolve(__dirname, 'src/shared/types/index.ts'),
      },
    },
  }),
);

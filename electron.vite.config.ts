import react from '@vitejs/plugin-react';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
    resolve: {
      alias: {
        // @shared/types must come before @shared — more-specific alias must win
        '@shared/types': resolve('src/shared/types/index.ts'),
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared/types': resolve('src/shared/types/index.ts'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react()],
  },
});

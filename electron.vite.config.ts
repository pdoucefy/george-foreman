import react from '@vitejs/plugin-react';

import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
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

import { is } from '@electron-toolkit/utils';

import type { BrowserWindow } from 'electron';
import { dialog, ipcMain } from 'electron';

import { checkOpenCodeBinary } from './binary-check.ts';
import { store, storeGet, storeSet } from './store.ts';

// §8 — M8 IPC handlers (onboarding + binary + dialog)
// Full window.api bridge is completed in M16.

const runBinaryCheck = async (
  mainWindow: BrowserWindow,
): Promise<{ found: boolean; path?: string }> => {
  const result = await checkOpenCodeBinary();
  mainWindow.webContents.send('binary:status', { found: result.found });
  return result;
};

export const registerIpcHandlers = (mainWindow: BrowserWindow): void => {
  // -------------------------------------------------------------------------
  // Onboarding
  // -------------------------------------------------------------------------

  ipcMain.handle('onboarding:is-complete', () => {
    const config = storeGet('config');
    return config.workspaceFolder !== '';
  });

  ipcMain.handle(
    'onboarding:complete',
    async (_event, params: { workspaceFolder: string; githubHandle: string }) => {
      const current = storeGet('config');
      storeSet('config', {
        ...current,
        workspaceFolder: params.workspaceFolder,
        githubHandle: params.githubHandle,
      });
      // TODO M9: trigger workspace:scan here
      await runBinaryCheck(mainWindow);
    },
  );

  // -------------------------------------------------------------------------
  // Binary check
  // -------------------------------------------------------------------------

  ipcMain.handle('binary:check', () => runBinaryCheck(mainWindow));

  ipcMain.handle('binary:recheck', () => runBinaryCheck(mainWindow));

  // -------------------------------------------------------------------------
  // Dialog
  // -------------------------------------------------------------------------

  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // -------------------------------------------------------------------------
  // Dev-only helpers
  // -------------------------------------------------------------------------

  if (is.dev) {
    ipcMain.handle('dev:clear-store', () => {
      store.clear();
    });
  }
};

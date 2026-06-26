import { is } from '@electron-toolkit/utils';

import type { BrowserWindow } from 'electron';
import { dialog, ipcMain } from 'electron';

import { checkOpenCodeBinary } from './binary-check.ts';
import { store, storeGet, storeSet } from './store.ts';
import { scanWorkspace } from './workspace.ts';

// IPC handlers: onboarding, binary check, dialog, workspace scan.
// Full window.api bridge is completed in M16.

const runBinaryCheck = async (
  mainWindow: BrowserWindow,
): Promise<{ found: boolean; path?: string }> => {
  const result = await checkOpenCodeBinary();
  mainWindow.webContents.send('binary:status', { found: result.found });
  return result;
};

const runWorkspaceScan = async (mainWindow: BrowserWindow, workspaceFolder: string) => {
  const repos = await scanWorkspace(workspaceFolder);
  mainWindow.webContents.send('workspace:updated', repos);
  return repos;
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
      await runWorkspaceScan(mainWindow, params.workspaceFolder);
      await runBinaryCheck(mainWindow);
    },
  );

  // -------------------------------------------------------------------------
  // Binary check
  // -------------------------------------------------------------------------

  ipcMain.handle('binary:check', () => runBinaryCheck(mainWindow));

  ipcMain.handle('binary:recheck', () => runBinaryCheck(mainWindow));

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------

  ipcMain.handle('workspace:scan', async () => {
    const config = storeGet('config');
    return runWorkspaceScan(mainWindow, config.workspaceFolder);
  });

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

import { is } from '@electron-toolkit/utils';

import type { BrowserWindow } from 'electron';
import { dialog, ipcMain } from 'electron';

import { checkOpenCodeBinary } from './binary-check.ts';
import { store, storeGet, storeSet } from './store.ts';
import { loadWorkflows } from './workflow-loader.ts';
import { scanWorkspace } from './workspace.ts';
import { listBranches, previewBranchName } from './worktree.ts';

// IPC handlers: onboarding, binary check, dialog, workspace scan, workflow list.
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
  // Workflow
  // -------------------------------------------------------------------------

  ipcMain.handle('workflow:list', async (_event, repoPath: string) => {
    const config = storeGet('config');
    return loadWorkflows({ repoPath, config });
  });

  // -------------------------------------------------------------------------
  // Branch / Repo
  // -------------------------------------------------------------------------

  const BRANCH_NAME_REGEX = /^[a-zA-Z0-9._\-/]+$/;
  const BRANCH_MAX_LENGTH = 250;
  const ACTIVE_STATUSES = new Set(['pending', 'running', 'needs_attention']);

  ipcMain.handle(
    'branch:validate',
    (
      _event,
      params: { repoPath: string; branchName: string; activeJobIds: string[] },
    ): { valid: boolean; error?: string } => {
      const { branchName, activeJobIds } = params;

      if (!BRANCH_NAME_REGEX.test(branchName)) {
        return { valid: false, error: 'Branch name contains invalid characters.' };
      }

      if (branchName.length > BRANCH_MAX_LENGTH) {
        return {
          valid: false,
          error: `Branch name must be ${BRANCH_MAX_LENGTH} characters or fewer.`,
        };
      }

      const jobs = storeGet('jobs');
      const isDuplicate = activeJobIds.some((id) => {
        const job = jobs[id];
        return job && ACTIVE_STATUSES.has(job.status) && job.branchName === branchName;
      });

      if (isDuplicate) {
        return {
          valid: false,
          error: 'A job with this branch name is already active. Choose a different name.',
        };
      }

      return { valid: true };
    },
  );

  ipcMain.handle(
    'branch:preview',
    (_event, params: { argument: string; workflowName: string; githubHandle: string }): string => {
      const config = storeGet('config');
      return previewBranchName({
        argument: params.argument,
        workflowName: params.workflowName,
        githubHandle: config.githubHandle,
      });
    },
  );

  ipcMain.handle(
    'repo:listBranches',
    (_event, repoPath: string): Promise<string[]> => listBranches(repoPath),
  );

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

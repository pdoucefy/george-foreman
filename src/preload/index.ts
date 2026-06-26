import { electronAPI } from '@electron-toolkit/preload';
import type { Job, OrchestratorEvent, Repo } from '@shared/types';

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

// @electron-toolkit/utils must NOT be imported in the preload — it accesses
// electron.app at module load time, which is undefined in the preload context.
// Use process.env.NODE_ENV instead (set by electron-vite during dev).
const isDev = process.env.NODE_ENV === 'development';

// Partial window.api bridge (onboarding, binary, dialog, workspace channels).
// Remaining channels are wired in M16.

const noop = (): void => {
  // stub — replaced in M16
};

const api = {
  // -------------------------------------------------------------------------
  // Onboarding
  // -------------------------------------------------------------------------
  onboarding: {
    isComplete: (): Promise<boolean> => ipcRenderer.invoke('onboarding:is-complete'),
    complete: (params: { workspaceFolder: string; githubHandle: string }): Promise<void> =>
      ipcRenderer.invoke('onboarding:complete', params),
  },

  // -------------------------------------------------------------------------
  // Binary check
  // -------------------------------------------------------------------------
  binary: {
    check: (): Promise<{ found: boolean; path?: string }> => ipcRenderer.invoke('binary:check'),
    recheck: (): Promise<{ found: boolean; path?: string }> => ipcRenderer.invoke('binary:recheck'),
  },

  // -------------------------------------------------------------------------
  // Dialog
  // -------------------------------------------------------------------------
  dialog: {
    openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-directory'),
  },

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------
  workspace: {
    scan: (): Promise<Repo[]> => ipcRenderer.invoke('workspace:scan'),
  },

  // -------------------------------------------------------------------------
  // Push subscriptions (main → renderer)
  // -------------------------------------------------------------------------
  onBinaryStatus: (cb: (params: { found: boolean }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, params: { found: boolean }): void => cb(params);
    ipcRenderer.on('binary:status', handler);
    return () => ipcRenderer.removeListener('binary:status', handler);
  },

  onNavigateSettings: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on('navigate:settings', handler);
    return () => ipcRenderer.removeListener('navigate:settings', handler);
  },

  // Stub subscriptions for channels not yet implemented — return a no-op unsubscribe.
  // These will be replaced in M16 with real handlers.
  onJobCreated: (_cb: (job: Job) => void): (() => void) => noop,
  onJobUpdated: (_cb: (job: Job) => void): (() => void) => noop,
  onSseEvent: (_cb: (params: { jobId: string; event: unknown }) => void): (() => void) => noop,
  onSseOrchestratorEvent: (
    _cb: (params: { jobId: string; event: OrchestratorEvent }) => void,
  ): (() => void) => noop,
  onWorkspaceUpdated: (cb: (repos: Repo[]) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, repos: Repo[]): void => cb(repos);
    ipcRenderer.on('workspace:updated', handler);
    return () => ipcRenderer.removeListener('workspace:updated', handler);
  },
  onNavigateJob: (_cb: (jobId: string) => void): (() => void) => noop,

  // Dev-only helpers — only present when is.dev === true
  ...(isDev && {
    dev: {
      clearStore: (): Promise<void> => ipcRenderer.invoke('dev:clear-store'),
      resetAndReload: async (): Promise<void> => {
        await ipcRenderer.invoke('dev:clear-store');
        location.reload();
      },
    },
  }),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error window.electron is injected by the preload script
  window.electron = electronAPI;
  // @ts-expect-error window.api is injected by the preload script
  window.api = api;
}

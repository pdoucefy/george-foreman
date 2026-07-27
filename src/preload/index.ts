import { electronAPI } from '@electron-toolkit/preload';
import type {
  Config,
  ElectronAPI,
  Job,
  JobCreateParams,
  OrchestratorEvent,
  Repo,
} from '@shared/types';

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

// @electron-toolkit/utils must NOT be imported in the preload — it accesses
// electron.app at module load time, which is undefined in the preload context.
// Use process.env.NODE_ENV instead (set by electron-vite during dev).
const isDev = process.env.NODE_ENV === 'development';

// window.api bridge: onboarding, binary, dialog, workspace, workflow, branch, repo (M8+M9+M14),
// and full job/permission/message/session channels (M15).
// settings.* handlers present but backed by store (full Zustand integration in M16).

const makePushSubscription = <T>(channel: string, cb: (value: T) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, value: T): void => cb(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api: ElectronAPI = {
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
  // Workflow
  // -------------------------------------------------------------------------
  workflow: {
    list: (repoPath: string) => ipcRenderer.invoke('workflow:list', repoPath),
  },

  // -------------------------------------------------------------------------
  // Settings (backed by store; full Zustand integration in M16)
  // -------------------------------------------------------------------------
  settings: {
    get: (): Promise<Config> => ipcRenderer.invoke('settings:get'),
    set: (partial: Partial<Config>): Promise<void> => ipcRenderer.invoke('settings:set', partial),
  },

  // -------------------------------------------------------------------------
  // Branch / Repo
  // -------------------------------------------------------------------------
  branch: {
    validate: (params: { repoPath: string; branchName: string; activeJobIds: string[] }) =>
      ipcRenderer.invoke('branch:validate', params),
    preview: (params: { argument: string; workflowName: string; githubHandle: string }) =>
      ipcRenderer.invoke('branch:preview', params),
  },

  repo: {
    listBranches: (repoPath: string): Promise<string[]> =>
      ipcRenderer.invoke('repo:list-branches', repoPath),
  },

  // -------------------------------------------------------------------------
  // Job management (M15)
  // -------------------------------------------------------------------------
  job: {
    create: (params: JobCreateParams): Promise<Job> => ipcRenderer.invoke('job:create', params),
    stop: (jobId: string): Promise<void> => ipcRenderer.invoke('job:stop', jobId),
    archive: (jobId: string): Promise<void> => ipcRenderer.invoke('job:archive', jobId),
    unarchive: (jobId: string): Promise<void> => ipcRenderer.invoke('job:unarchive', jobId),
    listActive: (): Promise<Job[]> => ipcRenderer.invoke('job:list-active'),
    listArchive: (): Promise<Job[]> => ipcRenderer.invoke('job:list-archive'),
    deleteWorktree: (jobId: string) => ipcRenderer.invoke('job:delete-worktree', jobId),
    deleteWorktreeForce: (jobId: string) => ipcRenderer.invoke('job:delete-worktree-force', jobId),
    getLog: (jobId: string): Promise<string> => ipcRenderer.invoke('job:get-log', jobId),
  },

  // -------------------------------------------------------------------------
  // Permission (M15)
  // -------------------------------------------------------------------------
  permission: {
    respond: (params: {
      jobId: string;
      permissionId: string;
      response: 'once' | 'always' | 'reject';
    }): Promise<void> => ipcRenderer.invoke('permission:respond', params),
  },

  // -------------------------------------------------------------------------
  // Message / Session (M15)
  // -------------------------------------------------------------------------
  message: {
    send: (params: { jobId: string; text: string }): Promise<void> =>
      ipcRenderer.invoke('message:send', params),
  },

  session: {
    messages: (params: { jobId: string; sessionId: string }) =>
      ipcRenderer.invoke('session:messages', params),
  },

  // -------------------------------------------------------------------------
  // Push subscriptions (main → renderer)
  // -------------------------------------------------------------------------
  onBinaryStatus: (cb: (params: { found: boolean }) => void): (() => void) =>
    makePushSubscription('binary:status', cb),

  onNavigateSettings: (cb: () => void): (() => void) =>
    makePushSubscription<undefined>('navigate:settings', () => cb()),

  onJobCreated: (cb: (job: Job) => void): (() => void) => makePushSubscription('job:created', cb),

  onJobUpdated: (cb: (job: Job) => void): (() => void) => makePushSubscription('job:updated', cb),

  onSseEvent: (cb: (params: { jobId: string; event: unknown }) => void): (() => void) =>
    makePushSubscription('sse:event', cb),

  onSseOrchestratorEvent: (
    cb: (params: { jobId: string; event: OrchestratorEvent }) => void,
  ): (() => void) => makePushSubscription('sse:orchestrator-event', cb),

  onWorkspaceUpdated: (cb: (repos: Repo[]) => void): (() => void) =>
    makePushSubscription('workspace:updated', cb),

  onNavigateJob: (cb: (jobId: string) => void): (() => void) =>
    makePushSubscription('navigate:job', cb),

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
  window.api = api;
}

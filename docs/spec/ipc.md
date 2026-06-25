# IPC Contract

Defined in `src/shared/ipc.ts`. Implemented in `src/preload/index.ts` via `contextBridge`.

## Conventions

- **Renderer → Main (invoke):** `ipcRenderer.invoke(channel, args)` ↔ `ipcMain.handle(channel, handler)`
- **Main → Renderer (push):** `webContents.send(channel, data)` ↔ `ipcRenderer.on(channel, handler)`
- Channel naming: `<domain>:<action>`

## Renderer → Main (invoke)

```ts
// Workspace
'workspace:scan'
  → () => Promise<Repo[]>

// Workflows
'workflow:list'
  → (repoPath: string) => Promise<Workflow[]>

// Settings
'settings:get'
  → () => Promise<Config>
'settings:set'
  → (partial: Partial<Config>) => Promise<void>

// Binary check
'binary:check'
  → () => Promise<{ found: boolean; path?: string }>
'binary:recheck'
  → () => Promise<{ found: boolean; path?: string }>
  // On found: also triggers auto-resume of any blocked jobs

// Dialog helpers
'dialog:open-directory'
  → () => Promise<string | null>
  // Returns selected path or null if cancelled

// Job management
'job:create'
  → (params: JobCreateParams) => Promise<Job>
'job:stop'
  → (jobId: string) => Promise<void>
'job:archive'
  → (jobId: string) => Promise<void>
  // Sets archivedAt = Date.now() on a failed or stopped job; moves to Archive tab
'job:unarchive'
  → (jobId: string) => Promise<void>
  // Clears archivedAt; returns failed/stopped job to Dashboard; not valid for completed
'job:list-active'
  → () => Promise<Job[]>
  // Returns jobs where archivedAt === null
'job:list-archive'
  → () => Promise<Job[]>
  // Returns jobs where archivedAt !== null
'job:delete-worktree'
  → (jobId: string) => Promise<{ success: boolean; hasUncommittedChanges?: boolean; error?: string }>
  // Step 1: attempts git worktree remove (no --force)
  // On success: { success: true }
  // On uncommitted changes: { success: false, hasUncommittedChanges: true, error: '...' }
  // On other failure: { success: false, error: '...' }
'job:delete-worktree-force'
  → (jobId: string) => Promise<{ success: boolean; error?: string }>
  // Step 2: attempts git worktree remove --force (only called after user confirms Force Delete)
'job:get-log'
  → (jobId: string) => Promise<string>

// Permission response
'permission:respond'
  → (params: { jobId: string; permissionId: string; response: 'once' | 'always' | 'reject' }) => Promise<void>

// Free-text message to orchestrator (always available while running)
'message:send'
  → (params: { jobId: string; text: string }) => Promise<void>

// Subagent drill-down
'session:messages'
  → (params: { jobId: string; sessionId: string }) => Promise<SessionMessage[]>

// Branch name utilities
'branch:validate'
  → (params: { repoPath: string; branchName: string; activeJobIds: string[] })
     => Promise<{ valid: boolean; error?: string }>
'branch:preview'
  → (params: { argument: string; workflowName: string; githubHandle: string })
     => Promise<string>

// Repo helpers
'repo:list-branches'
  → (repoPath: string) => Promise<string[]>
  // Returns sorted unique list of local + remote branch names (remote prefix stripped)
  // e.g. ['main', 'dev', 'feature/foo'] — used to populate base-branch dropdown

// Onboarding
'onboarding:is-complete'
  → () => Promise<boolean>
'onboarding:complete'
  → (params: { workspaceFolder: string; githubHandle: string }) => Promise<void>
```

## Main → Renderer (push)

```ts
// Job state updates
'job:created'         → (job: Job) => void
'job:updated'         → (job: Job) => void
// job:archived is not needed — archive state is derived from job.archivedAt via job:updated

// SSE event forwarding
'sse:event'           → (params: { jobId: string; event: unknown }) => void
  // Raw SSE event data (non-structured) for chat display

'sse:orchestrator-event'
                      → (params: { jobId: string; event: OrchestratorEvent }) => void
  // Structured orchestrator events (task_started, etc.)

// Binary status
'binary:status'       → (params: { found: boolean }) => void

// Workspace rescan result
'workspace:updated'   → (repos: Repo[]) => void

// Navigation (from notification click or Dock)
'navigate:job'        → (jobId: string) => void
'navigate:settings'   → () => void    // Settings gear / Cmd+, → show Settings panel
```

## Types in `src/shared/types.ts`

All types from [§9](./workspace-workflows.md#workflow-system), [§10](./job-creation.md#job-creation-flow), [§14](./job-state.md#job-lifecycle--state-machine), plus:

```ts
const schJobCreateParams = z.object({
  repoPath: z.string(),
  workflowName: z.string(),
  workflowTasks: z.array(schWorkflowTask),
  argument: z.string(),
  branchName: z.string(),
  baseBranch: z.string(),
});

const schMessagePart = z.object({
  type: z.enum(['text', 'tool_call', 'tool_result']),
  text: z.string().optional(),
});

const schSessionMessage = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  parts: z.array(schMessagePart),
  createdAt: z.number(),
});

type JobCreateParams = z.infer<typeof schJobCreateParams>;
type MessagePart = z.infer<typeof schMessagePart>;
type SessionMessage = z.infer<typeof schSessionMessage>;
```

## `window.api` — typed IPC bridge

`src/preload/index.ts` exposes a single `window.api` object via `contextBridge`. No raw
channel strings appear in renderer code.

```ts
// Shape of window.api (defined in preload, declared in src/shared/types.ts for TypeScript)
type ElectronAPI = {
  // Invoke (renderer → main, returns Promise)
  workspace: {
    scan: () => Promise<Repo[]>;
  };
  workflow: {
    list: (repoPath: string) => Promise<Workflow[]>;
  };
  settings: {
    get: () => Promise<Config>;
    set: (partial: Partial<Config>) => Promise<void>;
  };
  binary: {
    check: () => Promise<{ found: boolean; path?: string }>;
    recheck: () => Promise<{ found: boolean; path?: string }>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  job: {
    create: (params: JobCreateParams) => Promise<Job>;
    stop: (jobId: string) => Promise<void>;
    archive: (jobId: string) => Promise<void>; // failed/stopped only
    unarchive: (jobId: string) => Promise<void>; // failed/stopped only; not for completed
    listActive: () => Promise<Job[]>; // archivedAt === null
    listArchive: () => Promise<Job[]>; // archivedAt !== null
    deleteWorktree: (
      jobId: string,
    ) => Promise<{ success: boolean; hasUncommittedChanges?: boolean; error?: string }>;
    deleteWorktreeForce: (jobId: string) => Promise<{ success: boolean; error?: string }>;
    getLog: (jobId: string) => Promise<string>;
  };
  permission: {
    respond: (params: {
      jobId: string;
      permissionId: string;
      response: 'once' | 'always' | 'reject';
    }) => Promise<void>;
  };
  message: {
    send: (params: { jobId: string; text: string }) => Promise<void>;
  };
  session: {
    messages: (params: { jobId: string; sessionId: string }) => Promise<SessionMessage[]>;
  };
  branch: {
    validate: (params: {
      repoPath: string;
      branchName: string;
      activeJobIds: string[];
    }) => Promise<{ valid: boolean; error?: string }>;
    preview: (params: {
      argument: string;
      workflowName: string;
      githubHandle: string;
    }) => Promise<string>;
  };
  repo: {
    listBranches: (repoPath: string) => Promise<string[]>;
    // Sorted unique local + remote branch names; used for base-branch dropdown
  };
  onboarding: {
    isComplete: () => Promise<boolean>;
    complete: (params: { workspaceFolder: string; githubHandle: string }) => Promise<void>;
  };

  // Subscribe (main → renderer, returns unsubscribe function)
  onJobCreated: (cb: (job: Job) => void) => () => void;
  onJobUpdated: (cb: (job: Job) => void) => () => void;
  // onJobArchived removed — archive state derived from job.archivedAt in onJobUpdated
  onSseEvent: (cb: (params: { jobId: string; event: unknown }) => void) => () => void;
  onSseOrchestratorEvent: (
    cb: (params: { jobId: string; event: OrchestratorEvent }) => void,
  ) => () => void;
  onBinaryStatus: (cb: (params: { found: boolean }) => void) => () => void;
  onWorkspaceUpdated: (cb: (repos: Repo[]) => void) => () => void;
  onNavigateJob: (cb: (jobId: string) => void) => () => void;
  onNavigateSettings: (cb: () => void) => () => void; // Settings gear / Cmd+, → show Settings panel
};

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
```

## Renderer state management (Zustand)

The renderer uses **Zustand** for global state. One store (`src/renderer/src/store.ts`) holds
all shared state and is the single subscriber to IPC push events from main.

```ts
type AppStore = {
  // Repos
  repos: Repo[];
  setRepos: (repos: Repo[]) => void;

  // Jobs — single map; active/archived derived from archivedAt field
  jobs: Record<string, Job>;
  upsertJob: (job: Job) => void;
  // Derived selectors (not stored — computed from jobs map):
  // activeJobs  = Object.values(jobs).filter(j => j.archivedAt === null)
  // archivedJobs = Object.values(jobs).filter(j => j.archivedAt !== null)

  // UI state
  selectedJobId: string | null;
  selectJob: (jobId: string | null) => void;
  activeTab: 'dashboard' | 'archive';
  setActiveTab: (tab: 'dashboard' | 'archive') => void;
  showSettings: boolean; // true when Settings panel is visible
  setShowSettings: (show: boolean) => void;

  // Binary check
  binaryFound: boolean | null; // null = not yet checked
  setBinaryFound: (found: boolean) => void;
};
```

IPC listeners are registered **once** in `App.tsx` (or a top-level `useEffect`) and call Zustand
setters:

```ts
// All job state changes come through job:updated — a single upsertJob handles everything.
// Active vs archived is derived from job.archivedAt, not from separate IPC channels.
window.api.onJobCreated((job) => useAppStore.getState().upsertJob(job));
window.api.onJobUpdated((job) => useAppStore.getState().upsertJob(job));
window.api.onWorkspaceUpdated((repos) => useAppStore.getState().setRepos(repos));
window.api.onBinaryStatus(({ found }) => useAppStore.getState().setBinaryFound(found));
window.api.onNavigateJob((jobId) => {
  useAppStore.getState().setShowSettings(false);
  useAppStore.getState().setActiveTab('dashboard');
  useAppStore.getState().selectJob(jobId);
});
window.api.onNavigateSettings(() => {
  useAppStore.getState().setShowSettings(true);
});
// SSE events are subscribed per-job in the ChatThread component via onSseEvent,
// not in the global Zustand wiring.
```

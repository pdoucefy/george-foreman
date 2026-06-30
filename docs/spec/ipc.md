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

## Types in `src/shared/types/`

All types referenced above are defined in `src/shared/types/`. Read those files directly for current schemas — the spec does not duplicate them.

## `window.api` — typed IPC bridge

`src/preload/index.ts` exposes a single `window.api` object via `contextBridge`. No raw
channel strings appear in renderer code. The full `ElectronAPI` type and `declare global`
block are defined in `src/shared/types/ipc.ts` — read that file directly for the current
shape.

## Renderer state management (Zustand)

The renderer uses **Zustand** for global state. One store (`src/renderer/src/store.ts`) holds
all shared state and is the single subscriber to IPC push events from main. Read
`src/renderer/src/store.ts` directly for the current `AppStore` shape.

IPC listeners are registered **once** in `App.tsx` (or a top-level `useEffect`) and call Zustand
setters. All job state changes come through `job:updated` — a single `upsertJob` handles
everything. Active vs archived is derived from `job.archivedAt`, not separate IPC channels.

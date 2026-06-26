# Job Lifecycle & State Machine / Job State Persistence

## Job Lifecycle & State Machine

### Job status values

```ts
const schJobStatus = z.enum([
  'pending', // Created in store; worktree + process not yet ready
  'running', // opencode serve healthy; orchestrator active
  'needs_attention', // Waiting for user permission response
  'completed', // All tasks finished successfully
  'failed', // Fatal error (crash × 2, API error, setup failure)
  'stopped', // User manually stopped
]);

type JobStatus = z.infer<typeof schJobStatus>;
```

### Complete Job type

```ts
const schPendingPermission = z.object({
  permissionId: z.string(),
  description: z.string(), // Human-readable (from Permission.title)
  permissionType: z.string(), // e.g. 'bash', 'edit', 'webfetch'
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
});

const schTaskState = z.object({
  index: z.number().int().nonnegative(), // 0-based
  name: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  subagentSessionId: z.string().nullable(),
});

const schJob = z.object({
  id: z.string(), // 'job-<crypto.randomUUID()>'
  repoName: z.string(), // Directory basename of the repo
  repoPath: z.string(), // Absolute path to source repo
  worktreePath: z.string(), // Absolute path to worktree directory.
  // After deletion, this value is RETAINED for display/audit purposes.
  // Always check worktreeDeleted before accessing the filesystem at this path.
  worktreeDeleted: z.boolean(), // true after worktree is deleted; worktreePath still holds old path
  branchName: z.string(), // Full branch name (e.g. 'av-123/the-auth-module')
  baseBranch: z.string(), // Branch the worktree was created from
  workflowName: z.string(), // Display name of the workflow used
  argument: z.string(), // User-supplied argument text
  status: schJobStatus,
  port: z.number().nullable(), // Assigned opencode serve port
  orchestratorSessionId: z.string().nullable(),
  tasks: z.array(schTaskState),
  createdAt: z.number(), // Unix timestamp ms
  completedAt: z.number().nullable(), // Set when status becomes completed/failed/stopped
  archivedAt: z.number().nullable(), // null = on Dashboard; set when user archives or job completes
  errorMessage: z.string().nullable(), // Last error (for failed jobs)
  pendingPermission: schPendingPermission.nullable(),
  // Note: no pendingQuestion field — free-text input is always available while running
});

type PendingPermission = z.infer<typeof schPendingPermission>;
type TaskState = z.infer<typeof schTaskState>;
type Job = z.infer<typeof schJob>;
```

### State transitions

```text
pending
  → running          (opencode serve healthy + orchestrator session created + prompt sent)
  → failed           (any setup step fails: worktree, spawn, health timeout, session create)

running
  → needs_attention  (permission.updated SSE event received)
  → completed        (workflow_completed event OR session.idle fallback — see [Orchestrator Protocol](./opencode-integration.md#orchestrator-protocol))
  → failed           (crash × 2; API error after retries; session.error event)
  → stopped          (user clicks Stop)

needs_attention
  → running          (user responds to permission request)
  → failed           (crash × 2 while waiting; session.error event)
  → stopped          (user clicks Stop)

completed | failed | stopped
  → (terminal status — no further status transitions)
  → completed: archivedAt set automatically
  → failed / stopped: remain on Dashboard (archivedAt = null) until user archives manually
```

### Active vs archived

**Active** (shown on Dashboard): any job where `archivedAt === null`

- Includes: `pending`, `running`, `needs_attention`, `failed`, `stopped`
- `failed` and `stopped` jobs stay on Dashboard for investigation; user explicitly archives them

**Archived** (shown in Archive tab): any job where `archivedAt !== null`

- `completed` jobs: auto-archived on completion (`archivedAt` set automatically)
- `failed` / `stopped` jobs: manually archived by the user

**Un-archive:** available for `failed` and `stopped` jobs only — clears `archivedAt`, returns job to Dashboard. Not available for `completed` jobs (worktree was auto-deleted on completion).

---

## Job State Persistence (electron-store)

### Complete store schema

```ts
const schWindowBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const schConfig = z.object({
  workspaceFolder: z.string(),
  githubHandle: z.string(),
  userWorkflowsFolder: z.string().nullable(),
  defaultCopyGlobs: z.string(), // Newline-separated glob patterns
  windowBounds: schWindowBounds.nullable(),
});

const schStore = z.object({
  schemaVersion: z.literal(1),
  config: schConfig,
  jobs: z.record(schJob), // keyed by jobId
  jobLogs: z.record(z.string()), // keyed by jobId — accumulated stdout+stderr
});

type Config = z.infer<typeof schConfig>;
type StoreSchema = z.infer<typeof schStore>;
```

### Schema versioning and migration

On app startup, in `store.ts`:

```ts
const CURRENT_SCHEMA_VERSION = 1;

const stored = store.get('schemaVersion');
if (stored !== CURRENT_SCHEMA_VERSION) {
  // Clear all job data; preserve config if it exists
  const config = store.get('config');
  store.clear();
  if (config) store.set('config', config);
  store.set('schemaVersion', CURRENT_SCHEMA_VERSION);
}
```

Rationale: no production data to preserve in v1. Config is preserved across migrations.

### Write triggers

Write to `electron-store` on every:

- Job creation (initial `pending` state)
- Job status change
- `task_started` / `subagent_spawned` / `task_completed` / `workflow_completed` events
- Job moved to archive (completed/failed/stopped)
- Process log update on crash/exit
- Settings change (each field, debounced 500ms)
- Window bounds change (debounced 1s)

### Read triggers

- App startup: load all jobs, config, schema version
- SSE reconnect: reload task state for the reconnecting job, apply new events on top

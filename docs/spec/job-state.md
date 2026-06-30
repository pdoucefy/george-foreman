# Job Lifecycle & State Machine / Job State Persistence

## Job Lifecycle & State Machine

### Job status values

`JobStatus` is a Zod enum. See `src/shared/types/job.ts` for the full `Job`, `TaskState`, `JobStatus` and `PendingPermission` schemas.

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

### Store schema

See `src/shared/types/store.ts` for the full `StoreSchema`, `Config`, and `WindowBounds` Zod schemas.

### Schema versioning and migration

On app startup, `runStartupMigration()` in `store.ts` checks `schemaVersion`. On mismatch:
clear all job data, preserve `config`, reset version to current. See `src/main/store.ts` for
the implementation.

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

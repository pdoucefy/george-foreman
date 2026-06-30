# OpenCode Integration: Process Management / HTTP API / SSE / Orchestrator Protocol

## OpenCode Process Management

### Spawn command

```bash
opencode serve --port 0 --hostname 127.0.0.1
```

Spawned via `child_process.spawn`:

```ts
spawn('opencode', ['serve', '--port', '0', '--hostname', '127.0.0.1'], {
  cwd: worktreePath,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

- `cwd` is **always** `worktreePath` — opencode uses CWD as its project root
- `env: process.env` — inherits the full environment (preserves PATH, API keys, etc.)
- stdout and stderr are piped for capture

### Port discovery

After spawning, read stdout line-by-line searching for a pattern that indicates the port:

```text
/listening on.*:(\d+)/i
/started.*:(\d+)/i
/:(\d+)/   (fallback — first port-like reference)
```

The captured port is stored in the `jobId → port` map and persisted in `electron-store`.

**Timeout:** if no port is found in stdout within 10 seconds, fall back to port `4096`
(OpenCode's default). If `/global/health` on 4096 responds `{ healthy: true }`, use 4096.
Otherwise, proceed to the 30-second health poll on whatever port was found/assumed.

### Readiness detection

Once port is known:

- Poll `GET http://127.0.0.1:<port>/global/health` every 200ms
- On `{ healthy: true }` → server is ready; proceed to create orchestrator session
- On timeout (30 seconds total from spawn): kill process; mark job `failed` with reason
  `"opencode serve did not become ready within 30 seconds"`

### Process log capture

- All stdout and stderr lines are accumulated in a per-job ring buffer
- Max size: 500 KB per job (when exceeded, oldest lines are dropped)
- Log is written to `electron-store` (`jobLogs[jobId]`) on:
  - Process exit (any exit)
  - Job marked `failed`
- Accessible via `job:get-log` IPC channel
- Displayed in session panel only when job status is `failed`

### Crash handling

Monitor via the process `exit` event:

```text
Process exits unexpectedly (exit code non-zero, or unexpected exit):
  → If crashCount[jobId] === 0:
      Increment crashCount[jobId] to 1
      Wait 1 second
      Re-spawn (same command, same cwd, new port 0)
      Poll /global/health (30s timeout)
      On ready: re-subscribe to SSE; load stored task state; apply new events
      On timeout: mark job 'failed', reason "opencode serve failed to restart"
  → If crashCount[jobId] >= 1:
      Mark job 'failed', reason "opencode serve crashed twice"
      Write process log to electron-store
      Send job:updated IPC
```

Normal exit (exit code 0) when job was stopped intentionally → not treated as crash.

### Stopping a job (user-initiated)

1. Call `POST /session/:id/abort` on the orchestrator session
2. `process.kill('SIGTERM')` on the `opencode serve` process
3. Wait up to 3 seconds for process exit; if still running, `SIGKILL`
4. Mark job status `stopped`; record `completedAt`; `archivedAt` stays `null`
5. Persist; send `job:updated` IPC (job remains on Dashboard for review; user archives manually)

---

## OpenCode HTTP API Client

### Base URL

`http://127.0.0.1:<port>` — port from `jobId → port` map.

Each job has its own HTTP client instance bound to its port.

### All message sends use `prompt_async`

`POST /session/:id/prompt_async` → returns `204 No Content`. The app never waits for a
synchronous response to a message. All responses come through the SSE stream.

### Endpoints used

| Method | Path                                     | Purpose                                  |
| ------ | ---------------------------------------- | ---------------------------------------- |
| `GET`  | `/global/health`                         | Readiness polling after spawn/restart    |
| `GET`  | `/event`                                 | SSE stream — primary real-time mechanism |
| `GET`  | `/session/status`                        | Single poll on SSE reconnect             |
| `POST` | `/session`                               | Create orchestrator session              |
| `POST` | `/session/:id/prompt_async`              | Send initial workflow; answer questions  |
| `POST` | `/session/:id/permissions/:permissionID` | Respond to permission request            |
| `GET`  | `/session/:id/message`                   | Fetch subagent message history on demand |
| `POST` | `/session/:id/abort`                     | Abort session when user stops job        |

### Request format for initial workflow message

```ts
// POST /session/:id/prompt_async
{
  system: ORCHESTRATOR_SYSTEM_PROMPT,
  parts: [
    {
      type: 'text',
      text: buildWorkflowMessage(workflow, argument),
    },
  ],
}
```

Where `buildWorkflowMessage` produces:

```text
Execute the following workflow. Argument: "<argument>"

Tasks:
1. <task 1 name>
   <task 1 prompt with {{argument}} replaced>

2. <task 2 name>
   <task 2 prompt with {{argument}} replaced>

...
```

### Retry policy

- Network error / `ECONNREFUSED`: retry up to 3 times with 500ms between retries
- After 3 failures: mark job `failed` with the last error message
- Non-2xx responses: do not retry; log error body; mark job `failed`
- SSE disconnect: reconnect with exponential backoff — 1s, 2s, 4s, 8s, max 30s per attempt

---

## Real-time Updates (SSE)

### Connection setup

One SSE connection per active job, established in `opencode.ts`:

```ts
// SSE via Node.js http.get with streaming response
// (browser EventSource not available in Electron main process)
http.get(`http://127.0.0.1:${port}/event`, (res) => {
  res.on('data', (chunk) => parseSseChunk(chunk, onEvent));
  res.on('end', onDisconnect);
  res.on('error', onDisconnect);
});
```

### SSE event processing — two distinct pipelines

Each raw SSE message received from `GET /event` is processed through two separate pipelines:

#### Pipeline 1 — `GlobalEvent` wrapper (platform events)

Every SSE message from the OpenCode server is a `GlobalEvent`. The canonical schema is
defined in [Orchestrator Protocol](#orchestrator-protocol) (`schGlobalEvent`). Pipeline 1 dispatches on `payload.type`:

| `payload.type`         | Action                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permission.updated`   | Permission detection (see [Permission Detection](#permission-detection)); **do not** forward to chat                                                           |
| `session.idle`         | Completion/unexpected-termination fallback (see [session.idle Fallback](#sessionidle-fallback-completion--unexpected-termination)); **do not** forward to chat |
| `session.error`        | Mark job failed (see [session.error](#sessionerror--structured-error-from-orchestrator)); **do not** forward to chat                                           |
| `message.part.updated` | Extract the text delta; run through Pipeline 2; also forward full event to renderer via `sse:event` IPC                                                        |
| All other types        | Forward to renderer as `sse:event` IPC for chat display                                                                                                        |

#### Pipeline 2 — Orchestrator structured JSON blocks (within message text)

When a `message.part.updated` event delivers a text delta from the orchestrator session, scan
each line of the text for structured JSON blocks:

- Split the text delta on newlines
- For each line: attempt `JSON.parse(line)`
- If it parses as a valid `OrchestratorEvent` (known `type` field: `task_started`,
  `subagent_spawned`, `task_completed`, `workflow_completed`) → process as structured event
  (see [Structured Event Handling](#structured-event-handling)); **suppress that line from chat display**
- All other lines → include in chat display

### Reconnect

On disconnect (error or `end`):

1. Wait `Math.min(1000 * 2^attempts, 30000)` ms (exponential backoff, capped at 30s)
2. Reconnect to `GET /event`
3. On successful reconnect:
   - Do a single `GET /session/status` poll
   - Load latest task state from `electron-store`
   - Apply any new events from SSE on top

### No timer-based polling

The app **never** polls any OpenCode API on a scheduled interval. All real-time updates come
from SSE. The only bounded polling is:

- `GET /global/health` during startup/restart (terminates when healthy or on timeout)
- `GET /session/status` once per SSE reconnect (one-shot, not repeated)

---

## Orchestrator Protocol

### System prompt (sent as `system` field on first `prompt_async`)

```text
You are an orchestrator agent for George Foreman, an AI workflow automation system.
You will receive a workflow consisting of named tasks. Execute each task sequentially
by spawning a subagent for each one. Wait for each subagent to complete before
starting the next task.

For each task, spawn a subagent using the appropriate tool, passing it the task's
prompt verbatim. After each subagent completes, assess whether the task succeeded
before proceeding to the next task.

CRITICAL — Structured events:
You MUST emit the following JSON blocks at the exact moments described. Each block
MUST appear on its own dedicated line with NO other text on that line. This is
required for machine parsing by the host application.

When you begin a task (before spawning its subagent):
{"type":"task_started","task_index":<N>,"session_id":"<your own session ID>"}

When you spawn a subagent for a task:
{"type":"subagent_spawned","task_index":<N>,"session_id":"<the subagent session ID>"}

When a task's subagent completes successfully:
{"type":"task_completed","task_index":<N>}

When all tasks are done:
{"type":"workflow_completed"}

Rules:
- task_index is 0-based (first task = index 0)
- Each JSON block must be the only content on its line
- Do not wrap JSON blocks in code fences or add any text before/after on the same line
- Emit task_started BEFORE spawning the subagent
- Emit subagent_spawned immediately after you have the subagent's session ID
- Emit task_completed only after the subagent has finished
- Emit workflow_completed after the last task_completed
```

### Structured event types

`OrchestratorEvent` is a discriminated union on `type`: `task_started`, `subagent_spawned`,
`task_completed`, `workflow_completed`. See `src/shared/types/sse.ts` for the Zod schema.

### Structured event handling

Parsing: read each line of each SSE message data. If a line independently parses as valid JSON
with a known `type` field from the list above → treat as structured event; suppress from chat
display. All other content (including lines that failed JSON parsing) → display in chat thread.

**On `task_started`:**

- Set `tasks[task_index].status = 'in_progress'`
- Persist to `electron-store`
- Send `job:updated` IPC

**On `subagent_spawned`:**

- Set `tasks[task_index].subagentSessionId = session_id`
- Persist to `electron-store`
- Send `job:updated` IPC

**On `task_completed`:**

- Set `tasks[task_index].status = 'completed'`
- Persist to `electron-store`
- Send `job:updated` IPC

**On `workflow_completed`:**

- Set all remaining `in_progress` or `pending` tasks to `completed`
- Set `job.status = 'completed'`
- Set `job.completedAt = Date.now()`
- Set `job.archivedAt = Date.now()` (completed jobs are auto-archived)
- **Auto-delete the worktree:**
  - Run `git -C <repoPath> worktree remove <worktreePath>` (no `--force`)
  - If it succeeds: set `worktreeDeleted: true`
  - If it fails (uncommitted changes): set `worktreeDeleted: false`; show a persistent
    warning banner on the archived job card in the Archive tab:
    ```text
    ⚠ Worktree not deleted — uncommitted changes detected. Delete manually when ready.
    ```
    The "Delete worktree" option remains available in the overflow menu.
- Persist; send `job:updated` IPC (Zustand moves it to Archive because `archivedAt !== null`)

### Permission detection

OpenCode emits `permission.updated` events through the SSE stream. The `GlobalEvent` wrapper
and `Permission` Zod schemas are in `src/shared/types/sse.ts` — read that file for the full
wire shape.

When the app receives a `permission.updated` SSE event, check if `properties.sessionID`
matches any session belonging to this job — the orchestrator session **or** any known subagent
session (`job.tasks[].subagentSessionId`):

- Set `job.pendingPermission = { permissionId: p.id, description: p.title, permissionType: p.type, pattern: p.pattern }`
- Set `job.status = 'needs_attention'`
- Persist; send `job:updated` IPC
- If `!app.isFocused()` → fire macOS notification

**Responding to a permission:** call `POST /session/:id/permissions/:permissionID` where
`:id` is `permission.properties.sessionID` (the session that raised the permission — may be
a subagent, not the orchestrator). Using the orchestrator session ID for a subagent permission
would return 404.

**Permission response values** — `POST /session/:id/permissions/:permissionID`:

```ts
// Request body
{
  response: 'once' | 'always' | 'reject';
}

// 'once'   — allow this specific action, once
// 'always' — allow and remember (don't ask again for this type/pattern)
// 'reject' — deny
```

On response sent: clear `job.pendingPermission`; set `job.status = 'running'`; persist.

### `session.idle` fallback completion / unexpected termination

`EventSessionIdle` fires on the orchestrator session when it finishes its turn. Use as a
fallback in case `workflow_completed` was never emitted. Schema: `src/shared/types/sse.ts`.

**On `session.idle` for the orchestrator session:**

- If `job.status === 'needs_attention'` → **ignore** (session going idle while waiting for a
  permission response is expected; do not treat as unexpected termination)
- If `workflow_completed` has already been received → ignore (already handled)
- Else if `job.status === 'running'` AND all tasks have `status === 'completed'`:
  - Mark job `completed`, set `completedAt`, set `archivedAt = Date.now()`
  - Auto-delete worktree (same logic as `workflow_completed` above)
  - Persist; send `job:updated` IPC (Zustand moves to Archive because `archivedAt !== null`)
- Else if `job.status === 'running'` AND tasks are incomplete:
  - The orchestrator is paused mid-workflow, likely waiting for user input
  - Do **not** mark the job `failed`
  - Show the **"Waiting for your input…"** hint in the free-text input placeholder (see [UI Structure](./ui.md#ui-structure))
  - If `!app.isFocused()` → fire macOS notification:
    ```text
    Title: Input Required
    Body:  "<workflow name>" on <repo name> is waiting for your input.
    ```
  - Job stays `running`; user can send a free-text message to resume the orchestrator
  - Job only transitions to `failed` if `session.error` fires, or if the user stops it

### `session.error` — structured error from orchestrator

On `session.error` for the orchestrator session: mark job `failed` with the error message from
the event. Parse defensively — the properties shape is not fully documented. Schema:
`src/shared/types/sse.ts`.

### Free-text messaging (always available while running)

There is no structured "waiting for question" event in the OpenCode protocol. Instead, the
free-text input is **always visible** when `job.status === 'running'`. The user can message the
orchestrator at any time.

When `session.idle` fires and the job is still `running` (no `workflow_completed` received,
not all tasks complete), the input area shows a subtle hint: **"Waiting for your input…"** to
signal the orchestrator is paused and expects a response.

Sending a free-text message: `POST /session/:id/prompt_async` with the user's text.
No status change required — job stays `running`.

# Engineering: Error Handling / Build / CI

## Error Handling & Failure Modes

### Complete error catalog

| Scenario                                       | Detection                    | Recovery                                                                          | User-facing message                                           |
| ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `opencode` not found on PATH                   | Startup check                | "Recheck" after install                                                           | Banner: "opencode not found on PATH"                          |
| `opencode serve` never becomes ready           | 30s health timeout           | Mark `failed`                                                                     | "opencode serve did not start in 30 seconds"                  |
| `opencode serve` first crash                   | `exit` event                 | Auto-restart (1s delay)                                                           | Transparent to user                                           |
| `opencode serve` second crash                  | `exit` event                 | Mark `failed`, preserve log                                                       | "opencode serve crashed twice"                                |
| `git worktree add` fails                       | Non-zero exit                | Mark `failed`                                                                     | Verbatim git error                                            |
| Branch already exists in repo                  | `git show-ref`               | Inline error at step 4                                                            | "Branch already exists. Choose a different name."             |
| Branch name duplicate (active jobs)            | Pre-validate                 | Inline error at step 4                                                            | "A job with this branch name is already active."              |
| Branch name invalid chars                      | Pre-validate                 | Inline error at step 4                                                            | "Branch name contains invalid characters."                    |
| Workspace folder missing                       | Scan trigger                 | Error in Settings                                                                 | "Folder not found. Update path in Settings."                  |
| Repo removed during job creation               | Validate on create           | Error at creation                                                                 | "Repo not found"                                              |
| SSE connection drops                           | `error`/`end` event          | Exponential backoff reconnect                                                     | Transparent (badge reflects known state)                      |
| API non-2xx                                    | HTTP response                | Log + mark `failed` immediately                                                   | Last error response body                                      |
| API network error                              | `ECONNREFUSED` etc.          | Retry 3× / 500ms                                                                  | "Could not reach opencode API"                                |
| Disk full (worktree)                           | OS error from git            | Mark `failed`                                                                     | OS error message                                              |
| File copy failure                              | `fs.copyFile` error          | Warn + continue                                                                   | Non-fatal; visible in process log                             |
| Job `pending` at startup                       | Startup restore              | Mark `failed` immediately                                                         | "Job creation was interrupted"                                |
| Running job restart fails                      | Health timeout               | Mark `failed`                                                                     | "Failed to restart after app relaunch"                        |
| Argument slug is empty                         | Slug result empty            | Fallback slug                                                                     | Transparent                                                   |
| Subagent messages fetch fails                  | HTTP error                   | Error state in expanded row                                                       | "Could not load messages. [Retry]"                            |
| Worktree delete fails (uncommitted changes)    | `git worktree remove` error  | Second confirmation dialog with Force Delete option                               | "This worktree has uncommitted changes. Force delete?"        |
| Worktree delete fails (other error)            | `git worktree remove` error  | `git worktree prune` + error in dialog                                            | Verbatim git error                                            |
| Auto-delete on completion fails (uncommitted)  | `git worktree remove` error  | Persist `worktreeDeleted: false`; show warning on archived card                   | "Worktree not deleted — uncommitted changes detected."        |
| YAML workflow malformed                        | Parse error                  | Skip file, `console.warn`                                                         | (silent; shown if all workflows fail to load)                 |
| `electron-store` schema mismatch               | Schema version check         | Clear jobs, preserve config                                                       | Transparent                                                   |
| Orchestrator structured event parse fails      | JSON.parse error             | Log + treat as prose                                                              | Transparent                                                   |
| `session.error` SSE event received             | SSE event type check         | Mark `failed` with error msg                                                      | Error message from the event                                  |
| Two repos share the same directory basename    | `git worktree add` OS error  | Surface in job error message; user must rename one repo                           | Verbatim git error                                            |
| `session.idle` mid-workflow (tasks incomplete) | SSE event + task state check | Show "Waiting for input" hint; fire notification if !focused; job stays `running` | "Input Required — waiting for your input" (notification only) |

### General failure principles

- Job-level errors are isolated to that job — never crash the main process
- All unrecoverable job errors produce a `failed` status with an `errorMessage`
- Failed jobs are preserved in Archive with their process log
- The app remains functional for all other jobs when one job fails

---

## Build & Packaging

### Development

```bash
pnpm dev       # electron-vite dev — hot reload
pnpm build     # electron-vite build → out/
pnpm preview   # preview production build
```

### Local packaging (personal use)

Produces an unsigned `.dmg` for running on your own machine. No Apple Developer account,
no signing, no notarization required — macOS does not block apps you build locally from source.

Config lives in `electron-builder.yml`. Targets `arm64` (Apple Silicon) only. Run
`pnpm package` (`pnpm build && electron-builder --mac --config electron-builder.yml`) to
produce a `.dmg` in `release/`. See [Backlog](./backlog.md) for `x64`/universal binary.

---

## CI Pipeline

Runs on pushes to `main` and on every pull request targeting `main`. See `.github/workflows/ci.yml` for the full config.

Steps: install → lint → typecheck (both tsconfigs) → test.

---

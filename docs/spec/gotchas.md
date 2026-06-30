# Known Gotchas

## ESLint v9 pinned

`eslint-plugin-react@7` is incompatible with ESLint v10. We are pinned to ESLint v9 until
`eslint-plugin-react@8` ships with flat config support. Do not upgrade ESLint past v9 until
this is resolved.

## Pure-ESM dependencies must be excluded from `externalizeDepsPlugin`

`externalizeDepsPlugin` externalizes all `dependencies` as `require()` calls in the CJS main
bundle. Pure-ESM packages (e.g. `electron-store`) cannot be loaded via `require()` — add them
to the `exclude` list in `electron.vite.config.ts` so Vite bundles them inline instead.

## `pnpm approve-builds` duplicates YAML keys

**Never run `pnpm approve-builds` or `pnpm approve-builds --all`.** It appends to
`pnpm-workspace.yaml` without deduplication, creating duplicate YAML keys that break
`pnpm install`. Add new `allowBuilds` entries manually.

## `EventSource` is not available in the Electron main process

The browser `EventSource` API is not available in Node.js. The SSE client is implemented
using `http.get` with a streaming response and a line-buffer parser (see [Real-Time Updates (SSE)](./opencode-integration.md#real-time-updates-sse)). Do not
use the browser `EventSource` class or add the `eventsource` npm package — the custom
approach is already specced and handles chunk-boundary splitting correctly.

## `electron-store` is a process-wide singleton

All jobs share one `electron-store` instance. Job data lives under the `jobs` map keyed by
`jobId`. Concurrent writes from multiple concurrent async job operations should be serialized
to avoid partial writes (write one job at a time to the store, or use a write queue).
Relevant to M15 (`job-manager.ts`).

## `session.idle` fires for all sessions, not just the orchestrator

The `session.idle` SSE event fires for every session including subagents. The app must filter
by `properties.sessionID === job.orchestratorSessionId` before using it as a completion
fallback.

## Testing gotchas

See [`gotchas-testing.md`](./gotchas-testing.md) for test-specific pitfalls: `vi.hoisted` mock
pattern, separate vitest configs, `vi.useFakeTimers()` + `userEvent`, `focus-trap-react` in
happy-dom.

## Permission responses use the permission's own `sessionID` — not the orchestrator ID

When responding to a permission: `POST /session/:id/permissions/:permissionID` where `:id` is
`permission.properties.sessionID`. This may be a subagent session, not the orchestrator. Using
the orchestrator session ID for a subagent permission returns 404.

## `window.api` is partially wired until M16

Only the M8 channels (`onboarding`, `binary`, `dialog`) are exposed via `contextBridge` until
M16 completes the full bridge. The remaining push subscriptions (`onJobCreated`, `onJobUpdated`,
`onWorkspaceUpdated`, `onNavigateJob`, `onSseEvent`, `onSseOrchestratorEvent`) are stub no-ops
that return `() => {}`. Calling any other `window.api` method (e.g. `job.create`) before M16
will fail at runtime. Do not call unimplemented channels from renderer code before M16.

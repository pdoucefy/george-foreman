# George Foreman — Agent Context

> **Maintenance rule:** Update this file and `SPEC.md` whenever a milestone is completed, files are added or removed, or a new gotcha is discovered.

**Single source of truth for the full spec:** [`SPEC.md`](./SPEC.md)

---

## What the app is

George Foreman is a macOS-only Electron application for managing AI agent (OpenCode) workflows. The user defines multi-step workflows in YAML; the app creates a git worktree per job, spawns `opencode serve` inside it, sends the workflow to an orchestrator session via HTTP, and monitors progress via SSE. Lives in the Dock — window hides on close, click the Dock icon to reopen.

---

## Type-check

Two separate tsconfigs — both must pass:

```bash
pnpm tsc --noEmit -p tsconfig.node.json
pnpm tsc --noEmit -p tsconfig.web.json
```

---

## Current codebase state

Real files (not stubs):

```text
src/main/
  index.ts            — App entry: BrowserWindow, single-instance, lifecycle wiring
  store.ts            — electron-store instance + schema migration + typed storeGet/storeSet
  window.ts           — Pure: shouldHideOnClose() + shouldAllowNewInstance()
  __tests__/
    store.test.ts     — 18 tests; uses vi.hoisted mock pattern (see Testing Patterns below)
    window.test.ts    — hide/quit decision, single-instance decision
```

Stubs (files exist but are not yet implemented):

- `src/preload/index.ts` — only exposes `window.electron`; `window.api` (the typed IPC bridge) is **not** wired yet
- `src/renderer/src/App.tsx` — centered title only; no ThemeProvider, no IPC, no font imports
- `src/renderer/src/main.tsx` — bare `ReactDOM.createRoot`; no `@fontsource` imports yet

Everything else is specced in [SPEC.md §28](./SPEC.md#28-implementation-milestones) but not yet built.

---

## Coding conventions

- **Arrow functions everywhere** — `func-style: ['warn', 'expression']`. No `function foo()` declarations.
- **Named exports** — `import/no-default-export: warn`. Avoid `export default`.
- **No `any`** — use `unknown` with type guards. All tsconfigs extend `@electron-toolkit/tsconfig` (strict mode).
- **Explicit return types** on all exported functions.
- **Zod at untrusted boundaries only**: YAML files, SSE events, IPC params, electron-store reads. Do not re-validate already-validated in-memory data.
- **`execFile` not `exec`** for all git commands — avoids shell injection.
- **No inline styles, no CSS modules, no Tailwind** — styled-components with theme tokens only.
- **Theme tokens only** in styled-components — `${({ theme }) => theme.accent.primary}`, never hardcoded hex.
- **`console.error`/`console.warn` allowed**; `console.log` triggers ESLint warning.
- ESLint: camelcase disabled for `src/shared/types/sse.ts` (snake_case keys match OpenCode wire protocol).

---

## Known gotchas

### `pnpm approve-builds` is broken — never run it

It appends to `pnpm-workspace.yaml` without deduplication, creating duplicate YAML keys that break `pnpm install`. Add `allowBuilds` entries manually.

### ESLint is pinned to v9 — do not upgrade

`eslint-plugin-react@7` is incompatible with ESLint v10. Do not run `pnpm add eslint@latest`.

### `store.ts` runs schema migration at module import time

`runStartupMigration()` is called as a side effect when the module is first imported. In tests, you **must** mock `electron-store` using `vi.hoisted` **before** any import of `store.ts`. See `src/main/__tests__/store.test.ts` for the established pattern.

### `electron-store` is a process-wide singleton

All jobs share one store instance. Concurrent async writes from multiple jobs must be serialized to avoid partial writes (write one job at a time, or use a write queue).

### `EventSource` is unavailable in the Electron main process

The browser `EventSource` API does not exist in Node.js. The SSE client must use `http.get` with a streaming response and a line-buffer parser. Do not use `EventSource` or add the `eventsource` npm package. See SPEC.md §15 for the implementation pattern.

### `opencode serve --port 0` — port is dynamic

The OS assigns a random port. You **must** parse stdout to discover the actual port before making any API calls. Patterns to match: `/listening on.*:(\d+)/i`, `/started.*:(\d+)/i`, `/:(\d+)/`. Fallback to 4096 after 10 seconds and verify with a health check.

### `opencode serve` CWD must be `worktreePath`

OpenCode uses its CWD as the project root. Always spawn with `cwd: worktreePath`. Wrong CWD = wrong codebase.

### `@shared/types` alias must come before `@shared`

In `electron.vite.config.ts` and both tsconfig `paths`, `@shared/types` must appear **before** `@shared` — the more-specific alias must win. If the order is wrong, `@shared/types` resolves to the `src/shared/types` directory instead of the barrel `index.ts`.

### `session.idle` fires for all sessions — filter required

`session.idle` fires for every session including subagents. Filter by `properties.sessionID === job.orchestratorSessionId` before treating it as a completion/pause event.

### Permission responses use the permission's own `sessionID` — not the orchestrator ID

When responding to a permission: `POST /session/:id/permissions/:permissionID` where `:id` is `permission.properties.sessionID`. This may be a subagent session, not the orchestrator. Using the orchestrator session ID for a subagent permission returns 404.

### Worktree directory path is permanent

`git worktree add` fixes the path at creation time. Never rename the worktree directory or the branch after creation.

### `app.dock.setBadge()` for the badge is macOS-only

No cross-platform guards needed — this app targets macOS exclusively. `app.dock`, `app.dock.setBadge()`, macOS notifications, and `nativeImage` are all used without guards.

### `nativeImage.createFromPath()` does not support `.icns`

It silently returns an empty image for `.icns` files — use PNG instead. The Dock icon is set from `resources/icon-1024.png`. The `.icns` file in `resources/` is only used by `electron-builder` for the packaged app bundle icon.

### Dock icon flashes the default Electron icon on startup and quit

`app.dock.setIcon()` is called in `app.whenReady()` but macOS briefly shows the default Electron icon before and after the app sets its own. Known limitation — see §29 backlog.

### Two repos with the same directory name causes worktree path collision

The worktree path is `<workspace>/<repoName>--<branchSlug>`. If two repos share the same directory basename and a job uses the same branch name in both, `git worktree add` will fail. Known limitation.

### `window.api` is not yet implemented in preload

`src/preload/index.ts` currently only exposes `window.electron`. The full typed `window.api` IPC bridge (defined in `src/shared/types/ipc.ts`) is not yet wired. This is part of M14.

### `@fontsource` packages are not yet installed

`@fontsource/barlow`, `@fontsource/barlow-condensed`, `@fontsource/jetbrains-mono`, `@fontsource/rubik-distressed` are not in `node_modules`. Importing them in `main.tsx` will fail until M6.

### `workflows/` directory is empty

No built-in workflow YAML files ship yet. This is part of M8.

### CI uses Node 24; dev environment uses Node 22

Minor discrepancy. Built-in Node 22 APIs (`fs.glob()`, `crypto.randomUUID()`) are available in both.

---

## OpenCode protocol gotchas

### All message sends use `prompt_async`

`POST /session/:id/prompt_async` returns `204 No Content`. Never wait for a synchronous response. All responses arrive via SSE.

### Structured orchestrator events are JSON lines inside message text

The orchestrator emits structured events as bare JSON objects, one per line, inside `message.part.updated` SSE payloads. Parse each line: if `JSON.parse(line)` succeeds and the object has a known `type` field (`task_started`, `subagent_spawned`, `task_completed`, `workflow_completed`), process it as a structured event and **suppress it from chat display**. All other lines pass through to chat.

### SSE pipeline: two separate passes

Every SSE message goes through two pipelines:

1. **GlobalEvent wrapper** — dispatch on `payload.type` (permission.updated, session.idle, session.error, message.part.updated, etc.)
2. **Orchestrator structured JSON** — only for `message.part.updated` events: scan each line of the text delta for structured events

### `session.idle` mid-workflow means "waiting for input", not "completed"

If `session.idle` fires on the orchestrator session and tasks are not all complete, the orchestrator is paused waiting for user input. **Do not mark the job failed.** Show the "Waiting for your input…" hint. Only mark complete if all tasks have `status === 'completed'`.

---

## Testing patterns

### Mocking `electron-store` (required for `store.ts` tests)

`store.ts` calls `runStartupMigration()` at import time. The mock must be set up before any import. Use `vi.hoisted`:

```ts
const { dataRef } = vi.hoisted(() => {
  const dataRef = { data: {} as Record<string, unknown> };
  return { dataRef };
});

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: (key: string) => dataRef.data[key],
    set: (key: string, value: unknown) => {
      dataRef.data[key] = value;
    },
    clear: () => {
      dataRef.data = {};
    },
    store: dataRef.data,
  })),
}));
```

### Migration tests require `vi.resetModules()` + dynamic import

Each migration test needs a fresh module to re-run the import-time migration:

```ts
beforeEach(() => {
  vi.resetModules();
  dataRef.data = { schemaVersion: 0, config: { ... } };
});

it('migrates on version mismatch', async () => {
  await import('../store.ts'); // fresh import triggers migration
  expect(dataRef.data.jobs).toBeUndefined();
});
```

---

## IPC architecture

`src/shared/types/ipc.ts` declares `ElectronAPI` (the shape of `window.api`) and the global `Window` declaration. `src/preload/index.ts` will expose this as `window.api` via `contextBridge` (M14). Renderer code must only use `window.api` — never raw `ipcRenderer`.

IPC channel naming convention: `<domain>:<action>` (e.g. `job:create`, `workspace:scan`, `binary:check`).

Renderer → Main: `invoke` (Promise-based). Main → Renderer: `webContents.send` / `ipcRenderer.on` (fire-and-forget push).

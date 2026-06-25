# Known Gotchas

## ESLint v9 pinned

`eslint-plugin-react@7` is incompatible with ESLint v10. We are pinned to ESLint v9 until
`eslint-plugin-react@8` ships with flat config support. Do not upgrade ESLint past v9 until
this is resolved.

## `@electron-toolkit/utils` must not be imported in the preload

`@electron-toolkit/utils` accesses `electron.app.isPackaged` at **module load time**. `electron.app`
is `undefined` in the preload context (it only exists in the main process). Importing it in
`src/preload/index.ts` will throw `TypeError: Cannot read properties of undefined (reading 'isPackaged')`
and prevent the preload from loading entirely, leaving `window.api` undefined.

**Fix:** in the preload, use `process.env.NODE_ENV === 'development'` instead of `is.dev`.
electron-vite sets `NODE_ENV=development` during `pnpm dev`.

## Pure-ESM dependencies must be excluded from `externalizeDepsPlugin`

`electron-store` (and its dependency `conf`) are pure ESM packages — they have `"type": "module"`
and no CJS fallback. `externalizeDepsPlugin` externalises all `dependencies` as `require()` calls
in the CJS main bundle. `require()` cannot natively load a pure ESM module; it returns the module
namespace object instead of the default export, causing `TypeError: ElectronStore is not a
constructor` at runtime.

**Fix:** exclude the package in `electron.vite.config.ts` so vite bundles it inline (transpiling
ESM → CJS in the process):

```ts
// electron.vite.config.ts
main: {
  plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
}
```

Any future pure-ESM dependency used in the main process must be added to this `exclude` list.

## `pnpm approve-builds` duplicates YAML keys

**Never run `pnpm approve-builds` or `pnpm approve-builds --all`.** It appends to
`pnpm-workspace.yaml` without deduplication, creating duplicate YAML keys that break
`pnpm install`. Add new `allowBuilds` entries manually.

## Git worktree directory name is permanent

`git worktree add` fixes the directory path at creation time. It can never be renamed. The app
must never attempt to rename the worktree directory or the branch.

## `--port 0` requires reading stdout for the actual port

The OS assigns a random port when `opencode serve --port 0` is launched. The app must parse
stdout to discover which port was assigned before making any API calls.

## `opencode serve` CWD must be the worktree path

`opencode serve` uses its CWD as the project root. Always spawn with `cwd: worktreePath`.
Spawning from a different directory will cause OpenCode to operate on the wrong codebase.

## `EventSource` is not available in the Electron main process

The browser `EventSource` API is not available in Node.js. The SSE client is implemented
using `http.get` with a streaming response and a line-buffer parser (see [§15](./opencode-integration.md#real-time-updates-sse)). Do not
use the browser `EventSource` class or add the `eventsource` npm package — the custom
approach is already specced and handles chunk-boundary splitting correctly.

## macOS only — no cross-platform guards needed

This app targets macOS exclusively. `app.dock`, `app.dock.setBadge()`, macOS notifications, and
`nativeImage` are used without platform guards.

## `electron-store` is a process-wide singleton

All jobs share one `electron-store` instance. Job data lives under the `jobs` map keyed by
`jobId`. Concurrent writes from multiple concurrent async job operations should be serialized
to avoid partial writes (write one job at a time to the store, or use a write queue).

## Two repos with the same directory name is unsupported

The worktree path is `<workspace>/<repoName>--<branchSlug>`. If two repos in the workspace
share the same directory basename (possible with symlinks pointing to differently-named
directories) and the user creates jobs with the same branch name in both, the worktree paths
would collide. This is a known limitation — if it occurs, `git worktree add` fails with an OS
error, which is surfaced in the job error message. The fix is to rename one of the repos.

## `session.idle` fires for all sessions, not just the orchestrator

The `session.idle` SSE event fires for every session including subagents. The app must filter
by `properties.sessionID === job.orchestratorSessionId` before using it as a completion
fallback.

## `store.ts` runs schema migration at module import time

`runStartupMigration()` is called as a side effect when the module is first imported. In tests,
you **must** mock `electron-store` using `vi.hoisted` **before** any import of `store.ts`.
See `src/main/__tests__/store.test.ts` for the established pattern.

## `@shared/types` alias must come before `@shared`

In `electron.vite.config.ts` and both tsconfig `paths`, `@shared/types` must appear **before**
`@shared` — the more-specific alias must win. If the order is wrong, `@shared/types` resolves
to the `src/shared/types` directory instead of the barrel `index.ts`.

## Permission responses use the permission's own `sessionID` — not the orchestrator ID

When responding to a permission: `POST /session/:id/permissions/:permissionID` where `:id` is
`permission.properties.sessionID`. This may be a subagent session, not the orchestrator. Using
the orchestrator session ID for a subagent permission returns 404.

## `nativeImage.createFromPath()` does not support `.icns`

It silently returns an empty image for `.icns` files — use PNG instead. The Dock icon is set
from `resources/icon-1024.png`. The `.icns` file in `resources/` is only used by
`electron-builder` for the packaged app bundle icon.

## Dock icon flashes the default Electron icon on startup and quit

`app.dock.setIcon()` is called in `app.whenReady()` but macOS briefly shows the default
Electron icon before and after the app sets its own. Known limitation — see [§29](./backlog.md).

## `DefaultTheme` augmentation is required for styled-components theme typing

styled-components v6 does not automatically pick up the theme type. You must declare the
module augmentation in `src/renderer/src/styled.d.ts`:

```ts
import type { Theme } from './theme';

declare module 'styled-components' {
  interface DefaultTheme extends Theme {}
}
```

Without this, `${({ theme }) => theme.accent.primary}` in any styled component or
`createGlobalStyle` will type `theme` as `DefaultTheme = {}` — all token accesses silently
become `any`. The file must be included in `tsconfig.web.json`'s `include` glob (it is, via
`src/renderer/src/**/*`).

## `@fontsource` imports belong in `main.tsx`, not `App.tsx`

Font CSS imports must be placed in `src/renderer/src/main.tsx` (the renderer entry point),
not in `App.tsx`. Placing them in `App.tsx` causes no functional problem in Electron/Vite
today, but the entry point is the canonical location for side-effect-only imports — it makes
the load order explicit and avoids confusion when `App.tsx` is eventually replaced.

## Renderer tests use a separate vitest config

The renderer components require a browser environment (`happy-dom`) and React JSX support.
These cannot share the main-process config (`vitest.config.ts`, which uses `environment: 'node'`).
Use `vitest.config.web.ts` for renderer tests:

```bash
pnpm vitest run --config vitest.config.web.ts   # renderer only
pnpm vitest run --config vitest.config.ts        # main/shared only
```

The web config uses `@vitejs/plugin-react` for JSX transforms and `globals: true` so
`describe`/`it`/`expect`/`vi` are available without explicit imports.

## `vi.useFakeTimers()` breaks `userEvent.click()` — use `shouldAdvanceTime`

Calling `vi.useFakeTimers()` without options in a test that also uses `userEvent.click()` causes
the click to hang indefinitely (userEvent uses internal delays that are intercepted by fake timers).

**Fix:** pass `{ shouldAdvanceTime: true }` and use `userEvent.setup({ advanceTimers })`:

```ts
vi.useFakeTimers({ shouldAdvanceTime: true });
const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
await user.click(button);
act(() => {
  vi.advanceTimersByTime(4001);
});
vi.useRealTimers();
```

Never call `vi.useFakeTimers()` in `beforeEach` for tests that also use the default `userEvent`
import — the leak pollutes all subsequent tests in the same file.

## `focus-trap-react` requires a tabbable node — use `fallbackFocus`

When rendering a Modal in tests (happy-dom), `focus-trap-react` throws
`"Your focus-trap must have at least one container with at least one tabbable node"` if the
modal content contains no naturally focusable element.

**Fix:** always pass `fallbackFocus: () => document.body` in `focusTrapOptions`:

```tsx
<FocusTrap focusTrapOptions={{ allowOutsideClick: true, fallbackFocus: () => document.body }}>
```

This is safe in production too — it only activates when no other focusable node exists.

## `window.api` is partially wired until M16

Only the M8 channels (`onboarding`, `binary`, `dialog`) are exposed via `contextBridge` until
M16 completes the full bridge. The remaining push subscriptions (`onJobCreated`, `onJobUpdated`,
`onWorkspaceUpdated`, `onNavigateJob`, `onSseEvent`, `onSseOrchestratorEvent`) are stub no-ops
that return `() => {}`. Calling any other `window.api` method (e.g. `job.create`) before M16
will fail at runtime. Do not call unimplemented channels from renderer code before M16.

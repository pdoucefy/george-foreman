# Engineering: Error Handling / Conventions / Testing / Build / CI / Dependencies

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
| `session.idle` mid-workflow (tasks incomplete) | SSE event + task state check | Show "Waiting for input" hint; fire notification if !focused; job stays `running` | "Input Required — waiting for your input" (notification only) |

### General failure principles

- Job-level errors are isolated to that job — never crash the main process
- All unrecoverable job errors produce a `failed` status with an `errorMessage`
- Failed jobs are preserved in Archive with their process log
- The app remains functional for all other jobs when one job fails

---

## Coding Patterns & Conventions

> **Maintenance rule:** Update `AGENTS.md` and `docs/spec/` whenever a milestone is completed, files are added or removed, or a new gotcha is discovered.

### Module design

- **Pure functions for testability** — any logic that doesn't require Electron APIs is extracted
  into a dedicated module and tested independently of Electron
- **`index.ts` is thin wiring only** — creates Electron app/window objects, wires event
  listeners, calls pure helper modules. No business logic.
- Established pattern from M1: `window.ts` (pure) tested without mocking Electron

### File naming & organization

- Main process modules: `src/main/<module>.ts`
- Tests: `src/main/__tests__/<module>.test.ts` (one test file per module)
- Renderer components: `src/renderer/src/components/<ComponentName>/index.tsx` + optional
  `styles.ts` sibling
- Shared types: `src/shared/types.ts`
- IPC channels + types: `src/shared/ipc.ts`

### TypeScript

- All `tsconfig` files extend `@electron-toolkit/tsconfig` (strict mode enabled)
- No `any` — use `unknown` with type guards
- Prefer explicit return types on all exported functions
- Use `const` assertions (`as const`) for enum-like values

### ESLint (v9 flat config)

- Config: `eslint.config.ts`
- Pinned to ESLint v9 — **do not upgrade** (see [§27](./gotchas.md#known-gotchas))
- `import/order`: `off` (handled by Prettier sort-imports plugin)
- `react/prop-types`: `off`
- `react/react-in-jsx-scope`: `off`

### Prettier

- `printWidth: 100`, `singleQuote: true`, `tabWidth: 2`
- Import order: side-effects → bare packages → `@/` aliases → relative paths

### Pre-commit hooks

`simple-git-hooks` runs `lint-staged`:

- `*.{ts,tsx}`: `prettier --write` → `eslint --fix`
- `*.{json,yaml,md}`: `prettier --write`

### styled-components patterns

- `ThemeProvider` wraps entire app in `App.tsx`; `theme` imported from `theme.ts`
- Access tokens via `${({ theme }) => theme.accent.primary}` in template literals
- Or `useTheme()` hook in component functions
- `GlobalStyle.ts` uses `createGlobalStyle` — imported and rendered once in `App.tsx`
- No inline styles; no CSS modules; no Tailwind

### Child process safety

- Use `child_process.execFile` (not `exec`) for all git commands — avoids shell injection
- Validate branch names before passing to git commands
- Worktree paths constructed from known components (workspace folder + computed name)

### Zod — runtime validation and type inference

Use **Zod** for any boundary where data arrives from an untrusted or untyped source. Prefer
deriving TypeScript types from Zod schemas (`z.infer<typeof schema>`) rather than writing
parallel type definitions.

**Use Zod for:**

| Boundary                     | Module               | What to validate                                                                     |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| YAML workflow files          | `workflow-loader.ts` | `Workflow` shape (name, tasks array, task name + prompt, source enum)                |
| OpenCode SSE `GlobalEvent`   | `opencode.ts`        | Outer `{ directory, payload: { type, properties } }` shape before dispatch           |
| OpenCode `Permission` object | `opencode.ts`        | `Permission` shape (id, type, sessionID, title) before setting `pendingPermission`   |
| `electron-store` on read     | `store.ts`           | Full `StoreSchema` on startup — if parse fails, treat as schema mismatch and migrate |
| IPC `JobCreateParams`        | `job-manager.ts`     | Validate incoming params before creating a worktree                                  |

**Do not use Zod for:**

- Internal in-memory data that has already been validated at the boundary (no double-parsing)
- Renderer form validation — keep that as simple inline checks per the form specs in [§6](./app-lifecycle.md#first-launch-onboarding), [§7](./app-lifecycle.md#settings), [§10](./job-creation.md#job-creation-flow)

**Pattern:**

```ts
import { z } from 'zod';

const schWorkflowTask = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
});

const schWorkflow = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tasks: z.array(schWorkflowTask).min(1),
});

// Type is inferred — no separate interface needed
type Workflow = z.infer<typeof schWorkflow>;

// At the boundary:
const result = schWorkflow.safeParse(rawYaml);
if (!result.success) {
  console.warn('Malformed workflow:', result.error.flatten());
  return null;
}
const workflow = result.data; // fully typed
```

---

## Testing Strategy

### Vitest config (current — `vitest.config.ts`)

```ts
// Targets main process + shared modules
{
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
    alias: { '@shared': resolve(__dirname, 'src/shared') },
  },
}
```

### Renderer Vitest config (`vitest.config.renderer.ts` — to be created)

```ts
import react from '@vitejs/plugin-react';

import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.tsx', 'src/renderer/**/*.test.ts'],
    setupFiles: ['src/renderer/__tests__/setup.ts'],
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
```

`src/renderer/__tests__/setup.ts`:

```ts
import '@testing-library/jest-dom';
```

### Test scripts

```json
"test":           "vitest run",
"test:watch":     "vitest",
"test:renderer":  "vitest run --config vitest.config.renderer.ts",
"test:all":       "vitest run && vitest run --config vitest.config.renderer.ts",
"test:coverage":  "vitest run --coverage && vitest run --config vitest.config.renderer.ts --coverage"
```

### Unit tests (Node environment — `src/main/__tests__/`)

| Module                | Key test cases                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `window.ts`           | _(already done)_ hide/quit decision, single-instance decision                                                                                                          |
| `binary-check.ts`     | `opencode` found on PATH; not found; path returned correctly                                                                                                           |
| `workspace.ts`        | `.git` dir included; `.git` file (worktree) excluded; symlink included; missing folder returns empty; default branch detection from `symbolic-ref`; fallback to `main` |
| `workflow-loader.ts`  | Loads valid YAML; skips malformed files; source labeling; `{{argument}}` substitution; merges all three sources; empty sources return empty arrays                     |
| `worktree.ts`         | Path generation (branch `/` → `--`); command construction; `execFile` args; error propagation                                                                          |
| `opencode-process.ts` | Port discovery from stdout; fallback to 4096; crash count increment; second crash → `failed`; SIGTERM then SIGKILL sequence                                            |
| `store.ts`            | Schema version migration clears jobs preserves config; typed get/set round-trips                                                                                       |
| `notifications.ts`    | Permission notification content + `isFocused` gate; `session.idle` pause notification content + `isFocused` gate; no notification when app is focused                  |
| `job-manager.ts`      | State transitions (all from [§14](./job-state.md#job-lifecycle--state-machine)); startup restore logic                                                                 |
| Branch utils          | Slug generation (all edge cases); prefix selection (all 8 cases); uniqueness validation; git ref validity                                                              |

### Integration tests (Node + mock HTTP server)

`opencode.ts` is tested against a lightweight `http.createServer` started in `beforeAll`:

```ts
describe('opencode HTTP client', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => server.close());

  // Tests for each endpoint...
});
```

Cover:

- All endpoint methods and paths
- Correct request body shapes
- Retry logic (3 retries on ECONNREFUSED)
- Non-2xx → no retry, error propagated
- SSE: connects, receives events, calls callback
- SSE reconnect: `GET /session/status` called once on reconnect

### Renderer tests (jsdom + React Testing Library)

| Component         | Key test cases                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JobCard`         | Renders status pill with correct color; progress fraction; elapsed time format; click triggers selection                                                            |
| `TaskList`        | Renders correct icons per status; expand/collapse; lazy load trigger on first expand; loading state; error state with retry                                         |
| `ChatThread`      | Renders prose messages; auto-scroll on new message; scroll-lock pauses auto-scroll; "New messages" pill appears                                                     |
| `PermissionInput` | Renders title and type; Reject/Allow Once/Allow Always call `permission:respond` with correct `response` value; buttons disabled during in-flight                   |
| `FreeTextInput`   | Free-text always visible when running; Enter submits via `message:send`; Shift+Enter newline; placeholder changes on `session.idle` hint; disabled when not running |
| `Banner`          | Shown when binary missing IPC received; Recheck calls `binary:recheck`; auto-hides on `binary:status` found                                                         |
| `Onboarding`      | Step 1 validation; Browse dialog trigger; Next disabled if invalid; Step 2 validation; "Get Started" calls `onboarding:complete`                                    |
| `ArchiveTab`      | Status filter tabs update displayed jobs; search filters by name/repo/branch; empty state per filter                                                                |
| `Settings`        | All fields render; Browse calls `dialog:open-directory`; Rescan calls `workspace:scan`; auto-saves on change                                                        |
| `DashboardTab`    | Repos with no active jobs hidden; jobs grouped by repo; empty state when no jobs; "New Job" disabled when binary missing                                            |
| `SessionPanel`    | Header shows workflow/repo/branch; Stop button for running jobs only; permission mode vs question mode mutual exclusion                                             |

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

`electron-builder` config lives in `electron-builder.yml` (not in `package.json`):

```yaml
appId: com.anomaly.george-foreman
productName: George Foreman

directories:
  buildResources: resources
  output: release/${version}

files:
  - out/**/*
  - workflows/**/*

extraMetadata:
  main: ./out/main/index.js

mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch:
        - arm64
```

Targets `arm64` (Apple Silicon) only. See [§29](./backlog.md) for the backlog item on adding `x64`/universal
binary support.

### Build scripts

```json
"package": "pnpm build && electron-builder --mac --config electron-builder.yml"
```

Run `pnpm package` to produce a `.dmg` in `release/`. Double-click to install on your own Mac.

---

## CI Pipeline

### `.github/workflows/ci.yml`

Runs on pushes to `main` and on every pull request targeting `main`.

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v5

      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm tsc --noEmit -p tsconfig.node.json && pnpm tsc --noEmit -p tsconfig.web.json

      - name: Test
        run: pnpm test
```

---

## Dependencies

### Production dependencies

All production dependencies have been installed. The table below documents what each package is for:

| Package          | Version constraint | Purpose                             |
| ---------------- | ------------------ | ----------------------------------- |
| `electron-store` | `^10`              | Job state + config persistence      |
| `js-yaml`        | `^4`               | Parse workflow YAML files           |
| `zustand`        | `^5`               | Renderer global state management    |
| `zod`            | `^3`               | Runtime validation + type inference |
| `lucide-react`   | `^0.400`           | UI icon set (tree-shakeable SVGs)   |

### Dev dependencies to add

```bash
pnpm add -D electron-builder @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/js-yaml @tanstack/react-virtual @fontsource/barlow @fontsource/barlow-condensed @fontsource/jetbrains-mono @fontsource/rubik-distressed
```

| Package                        | Version constraint | Purpose                                         |
| ------------------------------ | ------------------ | ----------------------------------------------- |
| `electron-builder`             | `^25`              | macOS local packaging (unsigned `.dmg`)         |
| `@testing-library/react`       | `^16`              | Renderer component testing                      |
| `@testing-library/user-event`  | `^14`              | Simulated user interactions in tests            |
| `@testing-library/jest-dom`    | `^6`               | Custom DOM matchers (`toBeInTheDocument`, etc.) |
| `@types/js-yaml`               | `^4`               | TypeScript types for js-yaml                    |
| `@tanstack/react-virtual`      | `^3`               | Virtual scrolling in Archive tab                |
| `@fontsource/barlow`           | `^5`               | Barlow body font — bundled, no CDN              |
| `@fontsource/barlow-condensed` | `^5`               | Barlow Condensed for dense UI elements          |
| `@fontsource/jetbrains-mono`   | `^5`               | JetBrains Mono for code blocks                  |
| `@fontsource/rubik-distressed` | `^5`               | Rubik Distressed for app title only             |

### Node 22 built-ins used (no additional packages needed)

- **`crypto.randomUUID()`** — used for job ID generation (`'job-' + crypto.randomUUID()`)
- **`fs.glob()`** — used for expanding copy-files glob patterns in `worktree.ts`

Both are stable in Node 22 and require no npm packages.

Note: `@vitejs/plugin-react` is already in `devDependencies` — required by the renderer Vitest
config.

### `pnpm-workspace.yaml` additions

If `electron-builder` requires a postinstall script, add it manually:

```yaml
allowBuilds:
  esbuild: true
  electron: true
  simple-git-hooks: true
  unrs-resolver: true
  electron-builder: true # add only if pnpm warns about it
```

**Never run `pnpm approve-builds`** — see [§27](./gotchas.md#known-gotchas).

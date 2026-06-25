# George Foreman — Agent Context

> **Maintenance rule:** Update this file and `docs/spec/` whenever a milestone is completed, files are added or removed, or a new gotcha is discovered.

**Single source of truth for the full spec:** [`docs/spec/index.md`](./docs/spec/index.md)

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

src/renderer/src/
  theme.ts            — Design token object (bg, accent, status, text, border, space, font,
                        fontWeight, fontSize, radius, shadow) + Theme type
  GlobalStyle.ts      — createGlobalStyle: box-sizing reset, body background/color/font,
                        custom scrollbars (webkit + scrollbar-width), ::selection highlight
  styled.d.ts         — DefaultTheme augmentation: interface DefaultTheme extends Theme {}
  App.tsx             — ThemeProvider + GlobalStyle wired; placeholder Container/Title/Subtitle
                        (content is a stub, to be replaced in later milestones)
  main.tsx            — ReactDOM.createRoot + 9 @fontsource CSS imports
  components/ui/
    index.ts          — Barrel re-export of all UI components
    Badge.tsx         — Badge (generic pill) + StatusPill (maps JobStatus → color token)
    Button.tsx        — variants: primary, secondary, ghost, danger; loading + disabled states
    CodeBlock.tsx     — CodeBlock (fenced <pre><code>) + Code (inline); styled wrappers only
    Icon.tsx          — icon(LucideIcon) tree-shaking helper; default size=16, strokeWidth=1.5
    ScrollArea.tsx    — styled.div with overflow:auto + scoped themed scrollbar CSS
    Select.tsx        — @radix-ui/react-select wrapper; keyboard nav; themed
    Separator.tsx     — horizontal/vertical divider using border.subtle
    Spinner.tsx       — animated loading indicator with role="status"
    Textarea.tsx      — label, placeholder, error message, disabled
    TextInput.tsx     — label, placeholder, error message, disabled
    fieldUtils.ts     — Shared FieldWrapper, FieldLabel, FieldError, fieldInputCss
    Modal/
      index.tsx       — backdrop, close on Esc + backdrop click, focus-trap-react
    Toast/
      index.tsx       — ToastProvider; fixed top-right container; auto-dismiss (4s default)
      useToast.ts     — useToast() context hook; ToastContext; ToastVariant type

src/renderer/__tests__/
  setup.ts            — @testing-library/jest-dom import for happy-dom environment
  Badge.test.tsx      — render tests (all 6 JobStatus values)
  Button.test.tsx     — interaction tests (click, disabled, loading)
  CodeBlock.test.tsx  — render tests
  Icon.test.tsx       — render tests (defaults, override, tree-shaking)
  Modal.test.tsx      — interaction tests (Esc, backdrop click, focus trap, title)
  ScrollArea.test.tsx — render tests
  Select.test.tsx     — interaction tests (open, select, disabled)
  Separator.test.tsx  — render tests (horizontal/vertical)
  Spinner.test.tsx    — render tests (size, aria-label)
  Textarea.test.tsx   — render tests (label, error, disabled)
  TextInput.test.tsx  — render tests (label, error, disabled)
  Toast.test.tsx      — interaction tests (show, auto-dismiss, manual close, variants)
```

Stubs (files exist but are not yet implemented):

- `src/preload/index.ts` — only exposes `window.electron`; `window.api` (the typed IPC bridge) is **not** wired yet

Everything else is specced in [docs/spec/milestones.md](./docs/spec/milestones.md) but not yet built.

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

See [`docs/spec/gotchas.md`](./docs/spec/gotchas.md) for the full list.

---

## Testing patterns

### Renderer component tests

Renderer tests live in `src/renderer/__tests__/` and run with `vitest.config.web.ts`:

```bash
pnpm vitest run --config vitest.config.web.ts
```

The config uses `environment: 'happy-dom'`, `globals: true`, and `@vitejs/plugin-react` for JSX.
Setup file: `src/renderer/__tests__/setup.ts` (imports `@testing-library/jest-dom`).

Each test wraps the component in `<ThemeProvider theme={theme}>` — no global provider exists in tests.

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

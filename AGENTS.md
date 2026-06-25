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

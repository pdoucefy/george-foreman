# George Foreman — Agent Context

> **Maintenance rule:** Update this file and `docs/spec/` whenever a milestone is completed, files are added or removed, new conventions are introduced, or a new gotcha is discovered.

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

## IPC architecture

`src/shared/types/ipc.ts` declares `ElectronAPI` (the shape of `window.api`) and the global `Window` declaration. `src/preload/index.ts` exposes a **partial** `window.api` via `contextBridge` — M8+M9 channels (`onboarding`, `binary`, `dialog`, `workspace`, plus push subscriptions `onBinaryStatus`, `onNavigateSettings`, and `onWorkspaceUpdated`). The remaining channels are stub no-ops returning `() => {}`. The full bridge is completed in M16.

Renderer code must only use `window.api` — never raw `ipcRenderer`.

IPC channel naming convention: `<domain>:<action>` (e.g. `job:create`, `workspace:scan`, `binary:check`).

Renderer → Main: `invoke` (Promise-based). Main → Renderer: `webContents.send` / `ipcRenderer.on` (fire-and-forget push).

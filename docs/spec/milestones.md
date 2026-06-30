# Implementation Milestones

> **Maintenance rule:** Mark `[x]` when a milestone is complete

Implement in this order.

- [x] **M1.** Electron shell + window hide-on-close + Dock badge + single-instance lock
- [x] **M2.** Make repo public on GitHub (enables the `workflow-schema.json` public URL) + CI pipeline: `.github/workflows/ci.yml`
- [x] **M3.** Local packaging: `electron-builder.yml` config (arm64 only) + `pnpm package` script producing unsigned `.dmg`
- [x] **M4.** `electron-store` setup: schema v1, all typed accessors, schema-version migration logic
- [x] **M5.** `AGENTS.md` + `CLAUDE.md` symlink: agent-oriented codebase context file (project overview, key commands, conventions, milestone status, known gotchas); split `SPEC.md` into per-section files under `docs/spec/` with a short index
- [x] **M6.** Design system: `theme.ts` tokens (colors, fonts, spacing), `GlobalStyle.ts`, font imports (`@fontsource`) — applied from this milestone onward
- [x] **M7.** UI component library (`src/renderer/src/components/ui/`):
  - `Button` — variants: primary, secondary, ghost, danger; loading spinner state; disabled state
  - `TextInput` — label, placeholder, error message, disabled
  - `Textarea` — same as TextInput
  - `Select` — dropdown with keyboard navigation
  - `Modal` — backdrop, close on Esc + backdrop click, focus trap
  - `Spinner` — animated loading indicator
  - `Badge` / `StatusPill` — maps `JobStatus` → color token automatically
  - `Toast` — temporary notification (archive confirmation, worktree delete success/error, etc.)
  - `Separator` — horizontal/vertical divider using `border.subtle`
  - `ScrollArea` — custom scrollbar matching theme tokens
  - `CodeBlock` + `Code` (inline) — for markdown rendering in chat thread
  - `Icon` — thin re-export of `lucide-react` with consistent default `size={16}` and `strokeWidth={1.5}`
    All components use theme tokens exclusively. No inline styles. Each has a test in `src/renderer/__tests__/`.
- [x] **M8.** First-launch onboarding (2-step: workspace folder + GitHub handle) + `opencode` binary startup check + persistent error banner
  - **M4 store verification:** after completing onboarding, quit and relaunch the app — confirm it goes straight to the main UI (onboarding does not reappear). This proves the store correctly persisted `workspaceFolder` and `githubHandle`.
- [x] **M9.** Workspace scanning (`workspace.ts`): `.git` dir detection, symlink support, default branch detection
- [x] **M10.** Workflow YAML loading (`workflow-loader.ts`): all three sources + `.george-foreman/` parsing + `{{argument}}` auto-detection + validation + create `workflows/workflow-schema.json` and `workflows/example.yml`
- [x] **M11.** Git worktree management (`worktree.ts`): create, delete, path generation, pre-creation checks, `.george-foreman/copy-files` file copying
- [x] **M12.** OpenCode process management (`opencode-process.ts`): spawn, port discovery, health polling, crash handling (one auto-restart, then fail), process log capture (ring buffer)
- [ ] **M13.** OpenCode HTTP API client (`opencode.ts`): all endpoints, retry logic, SSE client (Node.js streaming), reconnect + status poll
- [ ] **M14.** Job creation flow — UI only (steps 1–4): repo select, workflow select, argument input, branch name preview + confirm + advanced base-branch selector
- [ ] **M15.** Job manager (`job-manager.ts`): state machine, full job creation orchestration (steps 4→10 from [Job Creation Flow](./job-creation.md#job-creation-flow)), crash handling, startup restore + auto-resume
  - **M4 store verification:** after a job reaches `running`, quit and relaunch the app — confirm the job reappears with its previous status and task state. This proves the store correctly persisted and restored the job record.
- [ ] **M16.** IPC bridge (`src/shared/ipc.ts`, `src/shared/types.ts`, `src/preload/index.ts`): all channels, fully typed `window.api` object; Zustand store skeleton (`src/renderer/src/store.ts`)
- [ ] **M17.** `DashboardTab` + `Layout`: repo grouping, job cards (status pill, progress bar, elapsed time), split-panel shell, session panel skeleton
- [ ] **M18.** Session panel: two-column layout, task list with status icons + background tints, expandable subagent rows (lazy-load messages), chat thread (auto-scroll, scroll-lock)
- [ ] **M19.** Input area: permission mode (3 buttons: Reject / Allow Once / Allow Always) + persistent free-text input (always shown when running; "Waiting for your input…" hint on session.idle)
- [ ] **M20.** Attention detection: Dock badge update + macOS notifications (isFocused gate) + notification click → navigate to job
- [ ] **M21.** `ArchiveTab`: status filter tabs, search, virtual scrolling, archive/unarchive actions, worktree delete (with two-step confirmation)
- [ ] **M22.** Settings UI: all four fields, Browse dialogs, Rescan button, auto-save, back navigation, `Cmd+,` shortcut
- [ ] **M23.** End-to-end validation: create a built-in workflow YAML for the george-foreman repo itself (`workflows/implement-milestone.yml` or similar); create a workflow for a chosen user repo (`.george-foreman/workflows/`); write an automated integration test that exercises the full job lifecycle (create → worktree → spawn → health → orchestrator → SSE → complete); manually run the app end-to-end against a real repo and confirm a job runs to completion
- [ ] **M24.** Release prep: `pnpm release patch|minor|major` script (`scripts/release.ts`) that guards on `main` branch + clean working tree, bumps `package.json` version, commits, creates a `vX.Y.Z` tag, and pushes both to origin; CI packaging pipeline (`.github/workflows/release.yml`) triggered on `v*` tags — builds arm64 `.dmg` via `pnpm package` and attaches it as a GitHub Release asset; verify all bundle assets (fonts, workflows, icon) are included in the DMG
- [ ] **M25.** Update README: replace placeholder with a proper project README — what the app is, screenshot(s), installation instructions (download DMG from releases or build from source), prerequisites (`opencode` on PATH), basic usage, link to `docs/spec/index.md` for the full spec

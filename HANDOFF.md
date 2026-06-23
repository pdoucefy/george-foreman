# George Foreman — Handoff Document

## Context

This document is a handoff from a planning + grilling session. The plan is complete and approved. The next session should proceed directly to **implementation**, starting with **milestone 1**.

The repo exists at `~/workspace/george-foreman` and is a blank slate (only `HANDOFF.md` and `README.md` exist). No scaffolding has been done yet.

**Environment:**

- macOS (darwin)
- Node.js v22.15.0, npm 10.9.2
- Build tooling: electron-vite

**Tray icon:** Generate programmatically using `nativeImage` (no icon file exists yet).

---

## What We're Building

**George Foreman** — a macOS Electron app for managing AI agent workflows.

- You define multi-step workflows in YAML files
- When you create a "job", the app spins up a Git worktree, launches `opencode serve` in it, and sends the workflow to an OpenCode orchestrator agent
- The orchestrator runs tasks sequentially, spawning subagents per task
- The app monitors job status via OpenCode's HTTP API and SSE stream
- When a job needs your attention (pending permission), you get a macOS notification + tray badge
- The dashboard groups active jobs by repo (only repos with active jobs are shown); a separate Archive tab holds completed/failed jobs

---

## Tech Stack

| Layer                 | Choice                  |
| --------------------- | ----------------------- |
| App framework         | Electron                |
| Frontend              | React + TypeScript      |
| Styling               | styled-components       |
| Main process          | Node.js (Electron main) |
| Agent communication   | OpenCode HTTP API + SSE |
| Workflow format       | YAML                    |
| Build tooling         | electron-vite           |
| App state persistence | electron-store          |

---

## Repository Structure

```text
~/workspace/george-foreman/
├── src/
│   ├── main/
│   │   ├── index.ts           # App entry, tray, window management
│   │   ├── job-manager.ts     # Job lifecycle (create, monitor, stop)
│   │   ├── opencode.ts        # OpenCode HTTP API client
│   │   ├── worktree.ts        # Git worktree management
│   │   └── workspace.ts       # Workspace folder scanning
│   ├── renderer/
│   │   ├── components/
│   │   │   ├── JobList/
│   │   │   ├── JobCard/
│   │   │   ├── SessionPanel/
│   │   │   ├── TaskList/
│   │   │   └── ChatThread/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   └── Archive.tsx
│   │   └── App.tsx
│   └── shared/
│       ├── types.ts
│       └── ipc.ts
├── workflows/
│   └── example.yml
├── electron.vite.config.ts
├── package.json
└── README.md
```

---

## Workflow File Format

```yaml
name: Implement Feature
description: Full cycle from tests to implementation to docs

tasks:
  - name: Write tests
    prompt: |
      Write unit tests for the feature described in SPEC.md.
      The feature to implement: {{argument}}

  - name: Implement
    prompt: |
      Implement the feature to make the tests pass.

  - name: Update docs
    prompt: |
      Update the README to document the new feature.
```

`{{argument}}` is replaced at job creation time with the user-supplied text input.

Workflows are loaded from two sources:

1. Built-in `workflows/` folder (ships with the app)
2. User-configurable workflows folder (set in Settings)

Both folders are scanned and merged in the workflow picker.

---

## First-Launch Onboarding

Two-step setup on first run:

1. **Workspace folder** — path to folder containing git repos (e.g. `~/workspace`)
2. **GitHub handle** — plain text field only (e.g. `pdoucet`), used for uncategorized branch naming

Stored in Electron app config. Accessible later in Settings.

**Do not** add a placeholder "Connect GitHub" OAuth button — that screen gets redesigned when OAuth lands in a future version.

**Startup check:** On every launch, the app verifies the `opencode` binary is on PATH. If not found, show a clear "opencode not found — please install it" error and block all job creation until resolved.

---

## Job Creation Flow

1. Pick repo (from scanned workspace)
2. Pick workflow (from built-in + user workflows folder)
3. Enter workflow argument (single text input — e.g. "AV-123", "the auth module")
4. Confirm — app auto-generates branch name (user can edit at this step)

**Branch naming convention:**

| Context                           | Pattern                        |
| --------------------------------- | ------------------------------ |
| Argument matches `AV-\d+`         | `AV-X/<local-slug>`            |
| Workflow name contains "bugfix"   | `bugfix/<local-slug>`          |
| Workflow name contains "refactor" | `refactor/<local-slug>`        |
| Workflow name contains "devx"     | `devX/<local-slug>`            |
| Workflow name contains "hotfix"   | `hotfix/<local-slug>`          |
| Workflow name contains "chore"    | `chore/<local-slug>`           |
| Workflow name contains "docs"     | `docs/<local-slug>`            |
| None of the above                 | `<github-handle>/<local-slug>` |

**Slug generation rules (all local, no orchestrator involvement):**

- `<local-slug>` is generated by slugifying the argument at job creation time (e.g. `AV-123` → `av-123`, `the auth module` → `the-auth-module`)
- The user can edit the full branch name at the confirmation step before any worktree is created
- The branch name is **permanent** after confirmation — the orchestrator never renames it, the app never renames it
- Branch names must be unique across **active jobs only** (archived/failed jobs do not block reuse of a branch name)
- The Git worktree directory name is also fixed at creation time and never renamed (Git constraint)

---

## Job Lifecycle

```text
User picks repo + workflow + argument
        ↓
App generates placeholder branch name locally (slugify argument)
User may edit branch name at confirmation step
        ↓
App creates Git worktree (git worktree add <path> <branch>)
        ↓
App spawns: opencode serve --port <dynamic> in worktree dir
stdout/stderr captured per job for diagnostics
        ↓
If opencode serve crashes:
  → one automatic restart attempt
  → if crashes again: mark job failed, preserve process log
        ↓
App creates orchestrator session via POST /session
        ↓
App sends workflow YAML + argument as initial message to orchestrator
        ↓
Orchestrator runs tasks sequentially, spawning subagents per task
Orchestrator emits structured JSON event blocks alongside prose (see below)
        ↓
App subscribes to SSE /event stream (primary real-time updates)
On SSE reconnect: single GET /session/status poll to catch missed events
        ↓
If pending permission → structured approve/deny UI (not a text box)
  + macOS notification if app.isFocused() === false
If orchestrator asks a question → free-text input box
        ↓
Job completes → moved to Archive tab
```

---

## Orchestrator Structured Events

The orchestrator emits structured JSON blocks in its messages so the app can parse machine-readable state without scraping prose. The surrounding prose is displayed in the chat thread as-is.

```json
{"type": "task_started", "task_index": 1, "session_id": "abc123"}
{"type": "task_completed", "task_index": 1}
{"type": "subagent_spawned", "task_index": 1, "session_id": "def456"}
```

The app uses these to:

- Update task progress indicators (X/Y, checkmarks)
- Track subagent session IDs for drill-down (queries `GET /session/:id/message` on demand)

> **Orchestrator prompt requirement:** The system prompt sent to the orchestrator session must explicitly instruct the model to emit each JSON block on its own line with no surrounding text on that line. This maximizes reliable parsing.

---

## Job State Persistence

Task progress is persisted to disk using `electron-store` so that the SSE stream is not the sole source of truth. On every structured JSON event (`task_started`, `task_completed`, `subagent_spawned`), `job-manager.ts` writes the current task state to the store. On app startup or SSE reconnect, the persisted state is loaded first, then new SSE events are applied on top.

Stored under a `jobState` key, keyed by job ID:

```ts
{
  "job-abc123": {
    tasks: [
      { index: 0, name: "Write tests", status: "completed",   subagentSessionId: "s1"   },
      { index: 1, name: "Implement",   status: "in_progress", subagentSessionId: "s2"   },
      { index: 2, name: "Update docs", status: "pending",     subagentSessionId: null   }
    ]
  }
}
```

This ensures task progress survives `opencode serve` crashes and app restarts. The orchestrator's session chat thread remains the canonical display; this store is strictly a progress checkpoint.

---

## UI Structure

### Tray

- App lives in the macOS menu bar (tray icon)
- Window hides on close (does not quit)
- Right-click tray icon → context menu with "Show" and "Quit"
- Tray badge = count of jobs currently needing attention (always up to date regardless of window focus)

### Dashboard (active jobs)

- Only repos with active jobs are shown — repos with no active jobs are hidden entirely
- Jobs grouped by repo
- Each job card shows: current task name | status pill | progress (X/Y tasks)
- Status pill colors: amber = needs attention, blue = thinking, green = completed, red = failed

### Session panel (click a job card)

- Header: workflow name, repo, worktree branch, elapsed time, overall status
- Task progress list: checkmarks for completed tasks, current task highlighted
- Each task row is expandable → shows the subagent's message thread for that task (debug drill-down)
- Orchestrator chat thread displayed below task list
- Two distinct input modes (mutually exclusive, never conflated):
  - **Permission request mode:** structured approve/deny buttons (calls `POST /session/:id/permissions/:permissionID`)
  - **Question mode:** free-text input (calls `POST /session/:id/message`)
- "View process log" button shown when job is in failed state (shows captured stdout/stderr)
- Failed jobs show the last error message prominently in the header area

### Archive tab

- Lists completed and failed jobs
- Single search box — searches across: job name, repo name, branch name, workflow name
- No re-run button (archive is read-only history)
- Each archived job has a "Delete worktree" option (`git worktree remove`) — worktrees are NOT auto-deleted
- Failed jobs show last error message prominently

### Settings (accessible from tray or onboarding)

- Workspace folder path (with rescan button)
- GitHub handle
- User-configurable workflows folder path

---

## Key Implementation Notes

1. **Port allocation** — each job gets a random available port; main process tracks `jobId → port` map
2. **SSE as primary** — subscribe to `GET /event` SSE stream for real-time updates; on reconnect do a single `GET /session/status` poll to catch any missed events. Do NOT poll on a timer.
3. **Subagent visibility** — orchestrator emits `subagent_spawned` JSON blocks with session IDs; app fetches their message history via `GET /session/:id/message` on demand when user expands a task row
4. **Worktree naming** — worktree directory path is fixed at `git worktree add` time (Git constraint); the branch name shown in UI is also permanent after confirmation
5. **Notification gating** — macOS notification fired only when `app.isFocused() === false`; tray badge always updates
6. **Workspace scanning** — scan configured workspace folder for `.git` directories one level deep; rescan button in Settings
7. **Branch uniqueness** — enforce uniqueness of branch name across active jobs only at creation time; archived jobs do not block new jobs reusing a branch name
8. **No re-run** — completed/failed jobs stay in archive as immutable history
9. **Process resilience** — one automatic restart attempt if `opencode serve` crashes; mark job failed on second crash, preserve stdout/stderr log
10. **opencode binary check** — check PATH for `opencode` at app startup; show blocking error screen if missing
11. **Tray quit** — the only way to fully quit the app is right-click tray → Quit; window close always hides to tray
12. **Permission vs question** — these are two distinct UI states, never merged into a single generic input. Permission has a structured approve/deny UI tied to a specific `permissionID`; a question has a free-text box.
13. **Process log** — capture stdout/stderr from each `opencode serve` process, stored per job; surfaced via "View process log" in session panel only when job has failed
14. **Job state persistence** — use `electron-store` to persist task progress on every structured JSON event. Load persisted state on startup and SSE reconnect; apply new events on top. Do not treat the SSE stream as the sole source of truth for task progress.

---

## Decisions Made (grilling session summary)

These were explicitly decided and should not be reopened without good reason:

| Topic                        | Decision                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Branch slug generation       | Local only — slugify the argument. No orchestrator involvement ever.                                                                |
| Branch name mutability       | Permanent after user confirms at job creation. Never renamed.                                                                       |
| Branch uniqueness scope      | Active jobs only. Archived jobs don't block reuse.                                                                                  |
| Worktree directory name      | Fixed at creation, never renamed (Git constraint).                                                                                  |
| Real-time updates            | SSE primary. Single poll on reconnect. No timer-based polling.                                                                      |
| Orchestrator event format    | Structured JSON blocks embedded in messages (not free-text parsing).                                                                |
| User workflows               | User-configurable folder in Settings, scanned alongside built-in `workflows/`.                                                      |
| Onboarding — GitHub handle   | Plain text field only. No OAuth placeholder UI.                                                                                     |
| Onboarding — opencode check  | Checked on every startup. Blocking error if not found.                                                                              |
| Permission vs question input | Two separate UI states, never merged.                                                                                               |
| Process crash handling       | One auto-restart, then fail the job.                                                                                                |
| Process log                  | Captured always, surfaced in session panel on failure.                                                                              |
| Dashboard — empty repos      | Hidden. Only repos with active jobs appear.                                                                                         |
| Archive search               | Single box across all fields (job name, repo, branch, workflow).                                                                    |
| Failed job worktree          | Preserved. Manual delete from Archive tab.                                                                                          |
| Failed job error display     | Last error message shown prominently.                                                                                               |
| Tray quit                    | Right-click tray → Quit only. Window close hides.                                                                                   |
| Tray icon                    | Programmatically generated via `nativeImage` (no icon file).                                                                        |
| Re-run                       | Not supported. Archive is read-only.                                                                                                |
| Job state persistence        | `electron-store` in `userData`. Written on every structured event. Loaded on startup/reconnect. SSE is additive, not authoritative. |

---

## Build Milestones (implement in this order)

- [x] **1.** Electron shell + tray (programmatic icon) + window hide-on-close + right-click tray menu (Show / Quit)
- [ ] **2.** First-launch onboarding (workspace folder + GitHub handle text field) + `opencode` binary startup check
- [ ] **3.** Workspace scanning + repo list
- [ ] **4.** Workflow YAML parsing + workflow library UI (built-in + user folder)
- [ ] **5.** Git worktree creation
- [ ] **6.** OpenCode process spawning (stdout/stderr capture, one auto-restart) + HTTP API client
- [ ] **7.** Job creation flow (repo → workflow → argument → branch name confirm/edit → create)
- [ ] **8.** Dashboard with SSE-based live status (single poll on SSE reconnect)
- [ ] **9.** Session panel + task list (structured JSON event parsing + `electron-store` task state persistence)
- [ ] **10.** Chat thread + two-mode input (permission approve/deny + free-text question)
- [ ] **11.** Attention detection + macOS notifications + tray badge
- [ ] **12.** Subagent drill-down (expand task row → subagent message thread)
- [ ] **13.** Archive tab + worktree cleanup + process log viewer

Mark milestones as complete `[x]` as they are finished.

---

## Suggested Skills

- `tdd` — recommended for job-manager and opencode client modules
- `diagnosing-bugs` — if something breaks during implementation

---

## OpenCode HTTP API Reference

Key endpoints used by this app:

- `GET /session/status` — status for all sessions (used on SSE reconnect)
- `GET /event` — SSE stream of live events (primary real-time mechanism)
- `POST /session` — create a new session
- `POST /session/:id/message` — send a free-text message to the orchestrator
- `POST /session/:id/permissions/:permissionID` — respond to a permission request (approve/deny)
- `GET /session/:id/message` — get full message history for a session
- `POST /session/:id/abort` — abort a running session

Full API docs: <https://opencode.ai/docs/server/>

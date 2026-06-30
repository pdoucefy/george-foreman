# Design System / UI Structure / Notification System

## Design System

### Brand Voice

Industrial, heavy-duty, "forge" aesthetic. Steel with burn marks, heat, and flame accents.
The app manages powerful AI agents — the UI should feel like a forge control panel.

### Design Tokens (`src/renderer/src/theme.ts`)

Token groups: `bg`, `accent`, `status`, `text`, `border`, `space`, `font`, `fontSize`, `radius`, `shadow`. Read `src/renderer/src/theme.ts` directly for current values.

### Status Pill Colors

| Status            | Color token                | Label           |
| ----------------- | -------------------------- | --------------- |
| `pending`         | `text.disabled` (grey)     | Starting…       |
| `running`         | `status.thinking` (blue)   | Thinking        |
| `needs_attention` | `status.attention` (amber) | Needs Attention |
| `completed`       | `status.completed` (green) | Completed       |
| `failed`          | `status.failed` (red)      | Failed          |
| `stopped`         | `status.stopped` (grey)    | Stopped         |

### Global Styles (`src/renderer/src/GlobalStyle.ts`)

- `box-sizing: border-box` on all elements
- No default margin/padding (`margin: 0; padding: 0`)
- `background: theme.bg.app` on `body`
- `color: theme.text.primary` on `body`
- Font: `theme.font.sans` (Barlow) as the default body font
- `theme.font.condensed` (Barlow Condensed) used for: status pills, labels, branch names, timestamps, badge counts
- `theme.font.mono` (JetBrains Mono) used for: code blocks and inline code in the chat thread
- `theme.font.display` (Rubik Distressed) used for: the "George Foreman" app title in the onboarding overlay only
- Custom scrollbars: thin style, `bg.elevated` track, `border.default` thumb
- Selection highlight: `accent.primary` at 40% opacity
- `ThemeProvider` from styled-components wraps entire app in `App.tsx`

### Font imports (`src/renderer/src/main.tsx`)

Fonts are imported once at the renderer entry point and bundled by electron-vite — no CDN requests at runtime (correct for an Electron app)

---

## UI Structure

### Overall window layout

The app is a single window with no client-side router. `App.tsx` owns the tab shell and IPC
listener wiring. `Layout.tsx` owns the shared split-panel shell (left list panel + right
session panel) and is rendered by both `DashboardTab` and `ArchiveTab`. There is no `pages/`
directory.

```text
App.tsx
  ├── Onboarding          (full-screen overlay — shown instead of everything else on first launch)
  ├── Banner              (conditional — binary missing)
  ├── Nav bar             (Dashboard tab | Archive tab | ⚙ Settings)
  └── active view
        ├── DashboardTab  (when activeTab === 'dashboard' && !showSettings)
        │     └── Layout  (left: JobList filtered to active | right: SessionPanel)
        ├── ArchiveTab    (when activeTab === 'archive' && !showSettings)
        │     └── Layout  (left: JobList filtered to archived + filters | right: SessionPanel)
        └── Settings      (when showSettings === true — full-width, no split panel)
```

```text
┌─────────────────────────────────────────────────────────────────────┐
│  George Foreman  [Dashboard (3)] [Archive]       [⚙ Settings]       │  ← Nav bar
├─────────────────────────────────────────────────────────────────────┤
│  [⚠ opencode not found banner — only when binary missing]           │  ← Conditional banner
├──────────────────────────┬──────────────────────────────────────────┤
│                          │                                          │
│  LEFT PANEL (~320px)     │  RIGHT PANEL (remaining width)           │
│  Job list                │  Session panel or empty state            │
│  (DashboardTab or        │  (shared across both tabs via Layout)    │
│   ArchiveTab filters)    │                                          │
└──────────────────────────┴──────────────────────────────────────────┘
```

### Dock

- Badge: `app.dock.setBadge(String(count))` where count = `needs_attention` jobs (empty string when 0); updated on every job status change
- Click: shows and focuses the window (standard macOS Dock behavior; no explicit handler needed)

### Nav bar

```text
┌──────────────────────────────────────────────────────────────────────┐
│  George Foreman   [Dashboard (3)] [Archive]          [⚙ Settings]    │
│  ───────────────                                                     │
│  (Rubik Distressed, theme.font.display, lg size, accent.primary)     │
└──────────────────────────────────────────────────────────────────────┘
```

- **App title** — "George Foreman" in `theme.font.display` (Rubik Distressed), `theme.fontSize.lg`,
  `theme.accent.primary` colour; positioned top-left; no click behavior
- **Dashboard tab** — with badge showing `needs_attention` count (hidden when 0)
- **Archive tab**
- **Settings gear icon (⚙)** — top-right; always accessible

### Binary missing banner

Displayed below the nav bar when `opencode` binary is not found:

```text
⚠  opencode not found on PATH — install it at opencode.ai, then click Recheck.   [Recheck]
```

- Background: `status.attention` (#f0a020) at low opacity on `bg.panel`
- Left border: solid `status.attention`
- "Recheck" button → calls `binary:recheck` IPC; banner auto-dismisses if binary is found
- Job creation button disabled (grayed, tooltip: "opencode must be installed to create jobs")
- Archive and Settings remain fully accessible

### DashboardTab (`src/renderer/src/components/DashboardTab/`)

The Dashboard shows all jobs where `archivedAt === null` — this includes active jobs
(`pending`, `running`, `needs_attention`) and terminal jobs awaiting review (`failed`, `stopped`).

**Left panel — Job list:**

- "New Job" button at top (or CTA if empty)
- Repos sorted alphabetically; only repos with at least one unarchived job shown
- Repos with no unarchived jobs are hidden entirely
- Within each repo, jobs are grouped into two sections:
  - **Active** (`pending`, `running`, `needs_attention`) — sorted by creation time, newest first
  - **Needs review** (`failed`, `stopped`) — sorted by `completedAt`, newest first; shown below active jobs with a subtle separator
- Repo section header: repo name + counts (e.g. "my-app — 2 active, 1 failed")
- Empty state (no unarchived jobs): centered flame icon + "No active jobs. Click ＋ to get started."

**Job card (active jobs):**

```text
┌────────────────────────────────────────────────┐
│ ● [Status pill]  Workflow Name                 │
│ branch-name/slug                   2 / 3 tasks │
│ Progress bar: ██████████░░░░░░                 │
│ repo-name · 2m 34s                             │
└────────────────────────────────────────────────┘
```

**Job card (failed/stopped — "needs review"):**

```text
┌────────────────────────────────────────────────┐
│ ✕ [Status pill]  Workflow Name        [Archive]│
│ branch-name/slug                               │
│ Last error message (truncated)                 │
│ repo-name · failed 5m ago                      │
└────────────────────────────────────────────────┘
```

- `failed` cards: red left border, error message shown truncated (1 line), "Archive" button
- `stopped` cards: grey left border, "Archive" button
- "Archive" button on card → sets `archivedAt = Date.now()`, moves job to Archive tab immediately
- Status pill color per [Status Pill Colors](#status-pill-colors)
- Progress bar: shown for active jobs only; omitted for failed/stopped cards
- Elapsed time: human-readable ("34s", "2m 34s", "1h 12m") for active; "failed Xm ago" / "stopped Xm ago" for terminal
- Click → selects job; right panel shows session panel
- Selected card: left border `accent.primary` (3px), background `bg.elevated`

**Right panel when no job selected:**

- Centered message: "Select a job to view details"

### Session panel

Shown in the right panel when a job card is selected (split view — left panel stays visible).

```text
┌─────────────────────────────────────────────────────┐
│ Workflow Name  ·  repo-name  ·  branch/name    [Stop] [⋮] │
│ [Status pill]  elapsed time                         │
├──────────────────────┬──────────────────────────────┤
│  TASKS (~280px)      │  CHAT THREAD                 │
│                      │                              │
│  ✓ Write tests       │  [message]                   │
│  ● Implement         │  [message]                   │
│    ▼ (expanded)      │  [message]                   │
│    [subagent msgs]   │                              │
│  ○ Update docs       │                              │
│                      ├──────────────────────────────┤
│                      │  INPUT AREA                  │
└──────────────────────┴──────────────────────────────┘
```

#### Session panel header

- Workflow name (bold), repo name, branch name
- Status pill + elapsed time (counts up in real time while job is active)
- **Stop button** — visible for `running` and `needs_attention` jobs only
- **Overflow menu (⋮):**
  - "View process log" — enabled only when job is `failed`; opens log in a scrollable modal
  - "Delete worktree" — visible only when `worktreeDeleted === false` (hidden once deleted);
    triggers two-step confirmation (see [Git Worktree Management](./job-creation.md#git-worktree-management))

#### Task list (left column, ~280px)

- Each task row uses **both** a status icon and a subtle background tint for redundant scannability:

  | Status             | Icon                                                                                                     | Row background tint              |
  | ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
  | `completed`        | `✓` (`status.completed`, green)                                                                          | `status.completed` at 8% opacity |
  | `in_progress`      | `●` (`accent.primary`, animated pulse)                                                                   | `accent.primary` at 8% opacity   |
  | `failed` (derived) | `✕` (`status.failed`, red) — rendered when `job.status === 'failed'` AND `task.status === 'in_progress'` | `status.failed` at 8% opacity    |
  | `pending`          | `○` (`text.disabled`, grey)                                                                              | none (transparent)               |

  Note: there is no `'failed'` value in `TaskState.status` — the `✕` state is derived from job status.

- Task name text — bold when `in_progress`
- Click row → expand/collapse subagent message thread
- Expanded subagent row:
  - Loads on first expand via `session:messages` IPC (lazy)
  - Shows condensed message list (prose text only; tool calls hidden)
  - "Loading…" spinner while fetching; inline "Could not load messages. [Retry]" on error
  - Collapse on second click
- Scrollable independently of chat thread

#### Chat thread (right column, upper)

- Scrollable message history from orchestrator session
- Structured JSON event lines consumed silently — not displayed
- Prose messages rendered with basic markdown:
  - Bold (`**text**`)
  - Inline code (`` `code` ``)
  - Code blocks (` ``` `)
  - No HTML rendering
- Auto-scroll to bottom on new messages
- Scroll-lock: if user has scrolled up (more than 50px from bottom), auto-scroll pauses;
  a "↓ New messages" pill appears at the bottom; clicking it resumes auto-scroll
- Failed job: last error message shown as a red banner in the chat area:
  ```text
  ⚠  opencode serve crashed twice
  [View process log]
  ```

#### Input area (right column, lower)

Two mutually exclusive modes, never combined:

**Permission mode** (`job.pendingPermission !== null`):

```text
┌──────────────────────────────────────────────────────┐
│ 🔒 Permission Required                               │
│ <permission.title — human-readable description>      │
│ Type: <permission.type>  Pattern: <pattern if set>   │
│ [Reject]        [Allow Once]        [Allow Always]   │
└──────────────────────────────────────────────────────┘
```

- **Reject** → `permission:respond` IPC with `response: 'reject'`
- **Allow Once** → `permission:respond` IPC with `response: 'once'`
- **Allow Always** → `permission:respond` IPC with `response: 'always'` (remembered by OpenCode)
- All three buttons disabled while request is in-flight (spinner on active button)
- On response sent: clear `pendingPermission`; job returns to `running`

**Free-text mode** (job status is `running` and `pendingPermission === null`):

```text
┌──────────────────────────────────────────────────────┐
│ [Text input — message the agent]                     │
│ [Shift+Enter for newline]        [Send →]            │
└──────────────────────────────────────────────────────┘
```

- Enter submits; Shift+Enter inserts newline
- "Send" → `message:send` IPC with text
- When `session.idle` fires and job is still `running`: input placeholder changes to
  **"Waiting for your input…"** (subtle hint that the orchestrator is paused)
- Input is **disabled** (greyed out) when job is `completed`, `failed`, or `stopped`:
  - `completed`: "Job completed"
  - `failed`: "Job failed — see error above"
  - `stopped`: "Job stopped"

### ArchiveTab (`src/renderer/src/components/ArchiveTab/`)

Shows all jobs where `archivedAt !== null` — completed jobs (auto-archived) and
manually archived failed/stopped jobs.

```text
┌──────────────────────────────────────────────────┐
│ [All] [Completed] [Failed] [Stopped]   [Search…] │
├──────────────────────────────────────────────────┤
│ [Archived job card]                              │
│ [Archived job card]                              │
│ ...                                              │
└──────────────────────────────────────────────────┘
```

- Status filter tabs: All | Completed | Failed | Stopped (active tab visually highlighted)
- Search box: filters across workflow name, repo name, branch name (case-insensitive substring)
- Sort: most recently `archivedAt` first (descending)
- Virtual scrolling (@tanstack/react-virtual) for performance
- Archived job card: same layout as Dashboard card; no progress bar; shows "Archived Xh ago"
- **Completed jobs:** worktree is auto-deleted on completion. If auto-deletion failed
  (uncommitted changes), the card shows a persistent amber warning:
  ```text
  ⚠ Worktree not deleted — uncommitted changes detected. Delete manually when ready.
  ```
- Click card → session panel opens in right panel (same split layout as Dashboard)
- Session panel for archived jobs:
  - No Stop button
  - **"Unarchive"** in overflow menu — available for `failed` and `stopped` jobs only;
    clears `archivedAt`, returns job to Dashboard; not available for `completed` jobs
  - "Delete worktree" in overflow menu — visible only when `worktreeDeleted === false`
    (hidden once deleted); uses two-step confirmation (see [Git Worktree Management](./job-creation.md#git-worktree-management))
- Empty state per filter: "No completed jobs yet", "No failed jobs", etc.

### New Job flow (modal/overlay)

A multi-step creation flow presented as a centered modal over the Dashboard.

Step indicators shown at top (1 · 2 · 3 · 4).

Step 1: repo list (with search)
Step 2: workflow list grouped by source (with search)
Step 3: argument input + live branch preview
Step 4: confirmation — branch name editable field + "Advanced options" collapse

"Cancel" button on all steps closes the modal without any side effects.
"← Back" on steps 2–4 returns to previous step.

### Settings panel

Full-screen content area (replaces left+right panels, not a modal):

```text
Workspace Folder  [/Users/pdoucet/workspace     ] [Browse] [Rescan]
GitHub Handle     [george-foreman               ]
User Workflows    [                             ] [Browse] [Clear]
Files to copy     ┌─────────────────────────────┐
(one glob/line)   │ .env                        │
                  │ .env.*                      │
                  │ .env.local                  │
                  └─────────────────────────────┘
```

"← Back" at top returns to previous tab.

### Onboarding overlay

Full-screen overlay (shown before any main UI on first launch):

```text
       ╔═══════════════════════════════════════╗
       ║  🔥 George Foreman                    ║
       ║  AI Agent Workflow Manager            ║
       ╠═══════════════════════════════════════╣
       ║                                       ║
       ║  Step 1 of 2                          ║
       ║  Where are your Git repositories?     ║
       ║  ──────────────────────────────────── ║
       ║  [/Users/pdoucet/workspace        ]   ║
       ║  [Browse…]                            ║
       ║                                       ║
       ║  [inline error if invalid]            ║
       ║                                       ║
       ║                     [Next →]          ║
       ╚═══════════════════════════════════════╝
```

Step 2 is identical structure with GitHub handle field and "Get Started →" CTA.

---

## Notification System

### When to fire

Fire a macOS notification when **all** of the following are true:

1. `app.isFocused() === false`
2. One of:
   - A job's status transitions to `needs_attention` (permission request)
   - `session.idle` fires on the orchestrator session while `job.status === 'running'` and tasks are incomplete (orchestrator paused, waiting for input)

Never fire when the app window is focused.

### Notification content

**Permission request** (`needs_attention`):

```text
Title: Action Required
Body:  "<workflow name>" on <repo name> needs your approval.
```

**Orchestrator paused** (`session.idle` mid-workflow):

```text
Title: Input Required
Body:  "<workflow name>" on <repo name> is waiting for your input.
```

Examples:

> **Action Required**
> "Implement Feature" on my-app needs your approval.
>
> **Input Required**
> "Implement Feature" on my-app is waiting for your input.

### App icon

Electron sets the notification app icon via `app.setIcon(nativeImage.createFromDataURL(...))`.
macOS automatically includes the app icon in notification banners.

### Notification click

For both notification types:

1. `mainWindow.show(); mainWindow.focus()`
2. Main process sends `navigate:job` IPC with the `jobId`
3. Renderer navigates to Dashboard, selects the job, opens session panel

### Dock badge

See [App Startup & Lifecycle](./app-lifecycle.md#app-startup--lifecycle) — Dock badge behavior is defined there.

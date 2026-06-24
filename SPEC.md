# George Foreman — Exhaustive Specification

> This document is the single source of truth for the George Foreman project. It covers every
> facet of the application: architecture, use cases, edge cases, error handling, IPC contract,
> data models, UI layout, design tokens, testing strategy, CI/CD, and implementation milestones.
> All decisions recorded here supersede any prior planning documents.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Environment & Toolchain](#2-environment--toolchain)
3. [Repository Structure](#3-repository-structure)
4. [Design System](#4-design-system)
5. [App Startup & Lifecycle](#5-app-startup--lifecycle)
6. [First-Launch Onboarding](#6-first-launch-onboarding)
7. [Settings](#7-settings)
8. [Workspace Scanning](#8-workspace-scanning)
9. [Workflow System](#9-workflow-system)
10. [Job Creation Flow](#10-job-creation-flow)
11. [Git Worktree Management](#11-git-worktree-management)
12. [OpenCode Process Management](#12-opencode-process-management)
13. [OpenCode HTTP API Client](#13-opencode-http-api-client)
14. [Job Lifecycle & State Machine](#14-job-lifecycle--state-machine)
15. [Real-time Updates (SSE)](#15-real-time-updates-sse)
16. [Orchestrator Protocol](#16-orchestrator-protocol)
17. [Job State Persistence (electron-store)](#17-job-state-persistence-electron-store)
18. [IPC Contract](#18-ipc-contract)
19. [UI Structure](#19-ui-structure)
20. [Notification System](#20-notification-system)
21. [Error Handling & Failure Modes](#21-error-handling--failure-modes)
22. [Coding Patterns & Conventions](#22-coding-patterns--conventions)
23. [Testing Strategy](#23-testing-strategy)
24. [Build & Packaging](#24-build--packaging)
25. [CI Pipeline](#25-ci-pipeline)
26. [Dependencies](#26-dependencies)
27. [Known Gotchas](#27-known-gotchas)
28. [Implementation Milestones](#28-implementation-milestones)
29. [Future / Backlog](#29-future--backlog)

---

## 1. Overview

**George Foreman** is a macOS Electron application for managing AI agent workflows.

The user defines multi-step workflows in YAML files. When a "job" is created, the app:

1. Creates a Git worktree for the target repository on a new branch
2. Spawns an `opencode serve` process inside that worktree
3. Sends the workflow + user argument to an OpenCode orchestrator session via HTTP
4. Monitors progress in real time via OpenCode's SSE event stream
5. Notifies the user when a job needs their attention (permission request or question)

The app lives in the macOS menu bar as a tray icon. The window hides on close; the only way to
fully quit is via the tray context menu.

---

## 2. Environment & Toolchain

| Item              | Value                                               |
| ----------------- | --------------------------------------------------- |
| OS                | macOS (darwin) — target platform only               |
| Node.js           | v22.15.0                                            |
| npm               | 10.9.2                                              |
| Package manager   | pnpm 11.8.0                                         |
| App framework     | Electron 42                                         |
| Build tooling     | electron-vite 3                                     |
| Frontend          | React 18 + TypeScript 5                             |
| Styling           | styled-components 6                                 |
| State persistence | electron-store                                      |
| YAML parsing      | js-yaml                                             |
| Validation        | zod                                                 |
| Renderer state    | zustand                                             |
| Body font         | Barlow + Barlow Condensed (via @fontsource)         |
| Mono font         | JetBrains Mono (via @fontsource)                    |
| Display font      | Rubik Distressed — app title only (via @fontsource) |
| Icons             | lucide-react                                        |
| Testing           | Vitest (unit + integration) + React Testing Library |
| Linting           | ESLint v9 (flat config)                             |
| Formatting        | Prettier + @trivago/prettier-plugin-sort-imports    |
| Pre-commit hooks  | simple-git-hooks + lint-staged                      |
| Packaging         | electron-builder                                    |

---

## 3. Repository Structure

```text
george-foreman/
├── .github/
│   └── workflows/
│       └── ci.yml             # Lint + typecheck + test on push/PR
├── resources/                 # Static assets (empty initially; icon files if needed)
├── src/
│   ├── main/
│   │   ├── __tests__/         # Vitest tests — one file per module
│   │   ├── index.ts           # App entry point — thin wiring only
│   │   ├── tray-icon.ts       # Pure: tray icon data URL generator
│   │   ├── window.ts          # Pure: window lifecycle helpers
│   │   ├── job-manager.ts     # Job lifecycle (create, monitor, stop, restore)
│   │   ├── opencode.ts        # OpenCode HTTP API client
│   │   ├── opencode-process.ts # opencode serve spawning, health polling, crash handling
│   │   ├── worktree.ts        # Git worktree management
│   │   ├── workspace.ts       # Workspace folder scanning
│   │   ├── workflow-loader.ts # YAML workflow loading + merging from all sources
│   │   ├── store.ts           # electron-store schema + typed accessors
│   │   ├── notifications.ts   # macOS notification helpers
│   │   └── binary-check.ts    # opencode binary PATH check
│   ├── preload/
│   │   └── index.ts           # contextBridge IPC bridge
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx       # React root
│   │       ├── App.tsx        # Root component — tab shell, IPC listener wiring
│   │       ├── Layout.tsx     # Split-panel shell (left list + right session panel)
│   │       ├── theme.ts       # Design tokens (see §4)
│   │       ├── GlobalStyle.ts # Global CSS reset + base styles
│   │       ├── store.ts       # Zustand app store
│   │       ├── components/
│   │       │   ├── ui/            # Shared UI components (Button, Modal, Input, Icon, ...)
│   │       │   ├── DashboardTab/  # Active-jobs tab content
│   │       │   ├── ArchiveTab/    # Archived-jobs tab content
│   │       │   ├── JobCard/
│   │       │   ├── JobList/
│   │       │   ├── SessionPanel/
│   │       │   ├── TaskList/
│   │       │   ├── ChatThread/
│   │       │   ├── PermissionInput/
│   │       │   ├── FreeTextInput/ # Renamed from QuestionInput — persistent input while running
│   │       │   ├── Banner/
│   │       │   ├── Onboarding/
│   │       │   └── Settings/
│   │       └── __tests__/     # React Testing Library tests
│   └── shared/
│       ├── types.ts           # Shared domain types
│       └── ipc.ts             # IPC channel names + request/response types
├── workflows/                 # Built-in workflow YAMLs (ships with app)
│   ├── workflow-schema.json   # JSON Schema for workflow YAML validation (VS Code + editors)
│   └── example.yml
├── electron.vite.config.ts
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── vitest.config.ts
├── vitest.config.renderer.ts
├── SPEC.md                    # This file
└── README.md
```

> **Note on `.george-foreman/`:** This is a per-repo config directory that lives inside each
> user's own repositories (not in the george-foreman app repo itself). See §9 for its format.

---

## 4. Design System

### Brand Voice

Industrial, heavy-duty, "forge" aesthetic. Steel with burn marks, heat, and flame accents.
The app manages powerful AI agents — the UI should feel like a forge control panel.

### Design Tokens (`src/renderer/src/theme.ts`)

```ts
export const theme = {
  // Background layers
  bg: {
    app: '#141414', // App background — near-black steel
    panel: '#1c1c1c', // Panel / sidebar surface
    card: '#222222', // Job card surface
    elevated: '#2a2a2a', // Elevated elements (modals, dropdowns)
    input: '#1a1a1a', // Input fields
  },

  // Accent — forge flame orange
  accent: {
    primary: '#e8621a', // Primary CTA, active state, flame
    warm: '#f0832a', // Hover state for primary
    glow: 'rgba(232, 98, 26, 0.25)', // Glow/shadow on focus
  },

  // Status colors
  status: {
    attention: '#f0a020', // Amber — needs attention (permission pending)
    thinking: '#4a90d9', // Steel blue — running / processing
    completed: '#3a9a5c', // Forge green — completed
    failed: '#c0392b', // Ember red — failed
    stopped: '#6b7280', // Cool grey — stopped
  },

  // Text
  text: {
    primary: '#e8e4de', // Warm off-white — primary text
    secondary: '#9a9390', // Muted warm grey — secondary / labels
    disabled: '#4a4745', // Disabled text
    inverse: '#141414', // Text on light/accent backgrounds
  },

  // Border
  border: {
    subtle: '#2e2e2e', // Subtle separator
    default: '#3a3a3a', // Default border
    strong: '#555555', // Prominent border
    accent: '#e8621a', // Accent border (focused, selected)
  },

  // Spacing scale (multiples of 4px)
  space: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
  },

  // Typography
  font: {
    sans: '"Barlow", sans-serif',
    condensed: '"Barlow Condensed", sans-serif',
    mono: '"JetBrains Mono", monospace',
    display: '"Rubik Distressed", serif', // app title only
  },

  // Font size scale
  fontSize: {
    xs: '11px', // labels, badges, timestamps
    sm: '12px', // secondary text, metadata
    md: '13px', // body / default
    lg: '15px', // card titles, section headings
    xl: '18px', // panel headers
    '2xl': '22px', // page titles (onboarding)
  },

  // Border radius
  radius: {
    sm: '4px',
    md: '6px',
    lg: '10px',
    full: '9999px',
  },

  // Elevation (box-shadow)
  shadow: {
    sm: '0 1px 3px rgba(0,0,0,0.5)',
    md: '0 4px 12px rgba(0,0,0,0.6)',
    lg: '0 8px 24px rgba(0,0,0,0.7)',
    glow: '0 0 12px rgba(232, 98, 26, 0.4)',
  },
} as const;

export type Theme = typeof theme;
```

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

Fonts are imported once at the renderer entry point and bundled by electron-vite — no CDN
requests at runtime (correct for an Electron app):

```ts
// Barlow — weights used in the app
// bold
// Barlow Condensed — for dense UI elements
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow/400.css';
// regular
import '@fontsource/barlow/500.css';
// medium
import '@fontsource/barlow/600.css';
// semibold
import '@fontsource/barlow/700.css';
// JetBrains Mono — for code blocks
import '@fontsource/jetbrains-mono/400.css';
// Rubik Distressed — app title only
import '@fontsource/rubik-distressed/400.css';
```

---

## 5. App Startup & Lifecycle

### Single-instance lock

The app uses `app.requestSingleInstanceLock()`. If a second instance is launched, it quits
immediately and the first instance's window is focused (`mainWindow.show(); mainWindow.focus()`).

### Startup sequence (every launch)

```text
app.whenReady()
  → createWindow()          — create BrowserWindow (hidden initially)
  → createTray()            — create Tray with programmatic flame icon
  → runStartupChecks()
      ├── checkOpenCodeBinary()
      │     ├── found     → clear any binary-missing state; attempt to resume blocked jobs
      │     └── not found → persist binary-missing flag; send IPC to renderer to show banner
      └── restoreJobs()     — only runs if onboarding is complete
            ├── load all jobs from electron-store
            ├── for each job with status 'pending':
            │     → mark 'failed' with reason "Job creation was interrupted"
            ├── for each job with status 'running' or 'needs_attention':
            │     → re-spawn opencode serve (same port not guaranteed; use port 0 again)
            │     → poll /global/health (200ms interval, 30s timeout)
            │     → on healthy: re-subscribe to SSE; load stored task state; apply new events
            │     → on timeout: mark job 'failed', reason "Failed to restart after app relaunch"
            └── for each job with status 'completed'/'failed'/'stopped':
                  → no action (archive entries, no process to start)
```

### Window behavior

- **Window hide on close:** `close` event intercepted; if `!isQuitting`, `event.preventDefault()` + `mainWindow.hide()`
- **Tray left-click:** toggle window — if hidden: `show() + focus()`; if visible: `hide()`
- **Tray right-click:** context menu — `Show` | `Settings` | _(separator)_ | `Quit`
- **`Cmd+,`:** opens Settings — registered via `app.applicationMenu` accelerator; sends `navigate:settings` IPC to renderer
- **Quit:** only via tray menu `Quit`. Sets `isQuitting = true` before `app.quit()`
- **`app.on('before-quit')`:** sets `isQuitting = true`
- **`app.on('window-all-closed')`:** no-op (tray-resident app, never quit on window close)
- **Window dimensions:** 900×650 initial; 700×500 minimum; freely resizable
- **Window position:** persisted in `electron-store` (`config.windowBounds`); restored on next launch
- **Dock icon:** shown while window is visible (`app.dock.show()`); hidden when window hides (`app.dock.hide()`)
- **Activation policy:** default `'regular'` — window appears in Cmd+Tab and Dock when visible. Do **not** call `app.setActivationPolicy('accessory')`. The Dock icon is managed manually via `app.dock.show()` / `app.dock.hide()` (see above).

### First launch detection

On startup, check `electron-store` for `config.workspaceFolder`. If absent (or empty string):
show onboarding overlay in renderer. Do not show main UI or run `restoreJobs()` until
onboarding is complete.

---

## 6. First-Launch Onboarding

Two-step setup presented as a full-screen overlay before the main UI.

### Step 1 — Workspace Folder

- Heading: "Where are your Git repositories?"
- Subtext: "George Foreman will scan this folder for repos."
- Input: path text field + "Browse…" button
  - Browse opens `dialog.showOpenDialog({ properties: ['openDirectory'] })`
- Validation (on Next click): path must be a non-empty string pointing to an existing directory
- Error state: inline below input — "Please select a valid folder"

### Step 2 — GitHub Handle

- Heading: "What's your GitHub username?"
- Subtext: "Used for naming branches when no other pattern matches (e.g. `pdoucefy/feature-name`)"
- Input: plain text field
- Validation (on Get Started click):
  - Non-empty
  - Matches `/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/`
- Error state: inline below input — "Please enter a valid GitHub username"
- **No OAuth button, no "Connect GitHub" placeholder** — plain text field only

### Dismiss behavior

- Closing the onboarding window (Cmd+W, red X, Esc) → `mainWindow.hide()` (hides to tray)
- On next "Show" from tray → onboarding is shown again (not the main UI)
- There is no way to skip onboarding

### Completion

On "Get Started" (step 2, valid):

1. Save `config.workspaceFolder` and `config.githubHandle` to `electron-store`
2. Run startup checks (`checkOpenCodeBinary()`)
3. Run `workspace:scan`
4. Show main UI (Dashboard tab)

---

## 7. Settings

Accessible from:

- **`Cmd+,`** — standard macOS keyboard shortcut (registered as a global menu accelerator)
- Tray context menu → "Settings"
- Settings gear icon (⚙) in the app top bar

All three send the `navigate:settings` IPC push from main to renderer.

`Cmd+,` is implemented via `app.applicationMenu` with a `MenuItem` entry:

```ts
{ label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => mainWindow.webContents.send('navigate:settings') }
```

Rendered as a full-screen panel replacing the content area (not a modal).

### Fields

| Field                 | Type            | Default (from onboarding or hardcoded) | Validation                                  |
| --------------------- | --------------- | -------------------------------------- | ------------------------------------------- |
| Workspace folder      | Path            | Set during onboarding                  | Non-empty; must exist and be a directory    |
| GitHub handle         | Text            | Set during onboarding                  | Valid GitHub username format                |
| User workflows folder | Path (optional) | — (empty)                              | If non-empty: must exist and be a directory |
| Files to copy         | Textarea        | `.env\n.env.*\n.env.local`             | Any text; parsed as gitignore-style globs   |

### Rescan button

Next to the workspace folder field. Clicking it immediately re-runs `workspace:scan` and
updates the repo list. Useful after adding a new repo to the workspace.

### Saving

All fields auto-save on change (debounced 500ms) to `electron-store`. No explicit "Save"
button. Validation errors show inline; invalid values are not persisted.

### Navigation back

A "← Back" link or button at the top of the Settings panel returns to the previously active
tab (Dashboard or Archive).

> **Known limitation:** the macOS two-finger swipe back gesture and mouse back button both
> trigger `history.back()` in the Electron renderer. Since the app has no client-side router
> and pushes no history entries, these gestures do nothing. The intended navigation mechanisms
> are the "← Back" button and `Cmd+,` (which toggles Settings). Browser-like navigation
> (swipe, mouse back/forward) is a backlog item — see §29.

---

## 8. Workspace Scanning

### Algorithm

1. Read `config.workspaceFolder` from store
2. List all entries (files + directories) in that folder — one level deep only
3. For each entry that is a directory (including symlinked directories):
   - Check if `<entry>/.git` exists **and** is a directory (not a file)
   - A `.git` **file** means it's a worktree — skip it
4. For valid repos, detect the default branch:
   ```bash
   git -C <repoPath> symbolic-ref refs/remotes/origin/HEAD --short
   # returns "origin/main" → strip "origin/" → "main"
   ```
   - If command fails (no remote, no HEAD set): try `main`, then `master` by checking if the
     ref exists. Fall back to `"main"` if neither exists.
5. Return sorted array of `Repo` objects (sorted alphabetically by `name`)

### Scan triggers

- App startup (after onboarding complete)
- "Rescan" button in Settings
- Workspace folder path changes in Settings

### Result stored in memory (not persisted)

```ts
const schRepo = z.object({
  name: z.string(), // directory basename
  path: z.string(), // absolute path
  defaultBranch: z.string(), // e.g. "main"
});

type Repo = z.infer<typeof schRepo>;
```

### Edge cases

| Scenario                                           | Behavior                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Workspace folder doesn't exist                     | Empty repo list; inline error in Settings: "Folder not found. Update path in Settings." |
| Workspace folder is empty                          | Empty repo list; Dashboard shows "No repos" empty state                                 |
| Repo has no remote                                 | Default branch detection falls back to `main`                                           |
| Symlinked directory                                | Included (resolved to real path for git commands)                                       |
| Directory named `.george-foreman` inside workspace | Scanned normally — if it contains `.git` it's a valid repo                              |

---

## 9. Workflow System

### Workflow file format (YAML)

```yaml
name: Implement Feature
description: Full cycle from tests to implementation to docs
argument: required # 'required' | 'optional' | 'none' — controls Step 3 of job creation

tasks:
  - name: Write tests
    prompt: |
      Write unit tests for the feature described in the spec.
      The feature to implement: {{argument}}

  - name: Implement
    prompt: |
      Implement the feature to make the tests pass.

  - name: Update docs
    prompt: |
      Update the README to document the new feature.
```

Fields:

- `name` — display name (required, non-empty string)
- `description` — shown in workflow picker (optional)
- `argument` — controls whether the argument input is shown at job creation (optional field):
  - `"required"` — argument input shown and must be non-empty before proceeding
  - `"optional"` — argument input shown but can be left blank
  - `"none"` — argument input hidden entirely; `{{argument}}` in prompts is replaced with an empty string
  - Default when omitted: `"required"` if any prompt contains `{{argument}}`, otherwise `"none"`
    (auto-detected by `workflow-loader.ts` at load time)
- `tasks` — ordered array of tasks (required, minimum 1 item)
- `tasks[].name` — task display name (required)
- `tasks[].prompt` — prompt text sent to subagent (required)
- `{{argument}}` — placeholder replaced at job creation time with user-supplied argument text;
  may appear in any `prompt` field; replaced in all tasks that contain it

### Schema validation (`workflows/workflow-schema.json`)

A JSON Schema (Draft 7) file is shipped with the app at `workflows/workflow-schema.json`. It
enables VS Code (and any editor with YAML Schema support) to validate workflow files with
inline errors and autocompletion.

#### Schema definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://raw.githubusercontent.com/anomalyco/george-foreman/main/workflows/workflow-schema.json",
  "title": "George Foreman Workflow",
  "description": "A multi-step AI agent workflow definition for George Foreman",
  "type": "object",
  "required": ["name", "tasks"],
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Display name shown in the workflow picker"
    },
    "description": {
      "type": "string",
      "description": "Optional description shown below the name in the workflow picker"
    },
    "argument": {
      "type": "string",
      "enum": ["required", "optional", "none"],
      "description": "Controls the argument input at job creation. 'required': shown and must be non-empty. 'optional': shown but may be blank. 'none': hidden entirely. Defaults to 'required' if any prompt contains {{argument}}, otherwise 'none'."
    },
    "tasks": {
      "type": "array",
      "minItems": 1,
      "description": "Ordered list of tasks to execute sequentially",
      "items": {
        "type": "object",
        "required": ["name", "prompt"],
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "description": "Task display name shown in the session panel task list"
          },
          "prompt": {
            "type": "string",
            "minLength": 1,
            "description": "Prompt sent to the subagent. Use {{argument}} as a placeholder for the user-supplied argument."
          }
        }
      }
    }
  }
}
```

#### Using the schema in VS Code

**Option 1 — `$schema` comment** (per-file, portable, recommended for `.george-foreman/workflows/`):

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/anomalyco/george-foreman/main/workflows/workflow-schema.json
name: Implement Feature
description: Full cycle from tests to implementation to docs
tasks:
  - name: Write tests
    prompt: |
      Write tests for: {{argument}}
```

**Option 2 — `.vscode/settings.json`** (applies automatically to all workflow files in the repo):

```json
{
  "yaml.schemas": {
    "https://raw.githubusercontent.com/anomalyco/george-foreman/main/workflows/workflow-schema.json": [
      ".george-foreman/workflows/*.yml",
      ".george-foreman/workflows/*.yaml"
    ]
  }
}
```

The schema is hosted publicly at its `$id` URL so users never need a local copy — VS Code
fetches and caches it automatically. The built-in `workflows/example.yml` includes the
`$schema` comment as a living example for users to copy.

> **Hosting requirement:** the schema URL only works once the `george-foreman` repo is public
> on GitHub and `workflows/workflow-schema.json` is committed to `main`. No extra deployment
> steps are needed — GitHub serves raw file content automatically. This is handled as part of
> **M19** (making the repo public before setting up CI). During development (before the repo
> is public), use a local relative path instead:
>
> ```yaml
> # yaml-language-server: $schema=../../../path/to/george-foreman/workflows/workflow-schema.json
> ```
>
> **Note:** requires the `redhat.vscode-yaml` VS Code extension (extremely widely installed;
> included in most default VS Code setups).

### Three workflow sources

Loaded and merged in this priority order (all three always shown in picker):

1. **Repo-level** — `.george-foreman/workflows/*.yml` inside the selected repo
   - Labeled with the repo name (e.g. "my-app")
   - Shown first in picker
2. **User folder** — path configured in Settings → User workflows folder (`*.yml`)
   - Labeled with the folder's basename
   - Shown second
3. **Built-in** — `workflows/*.yml` shipped inside the app bundle
   - Labeled "Built-in"
   - Shown last

No deduplication — workflows with the same `name` from different sources all appear, each with
their source label.

### `workflow-loader.ts`

Responsibilities:

1. Given a `repoPath` and the current `Config`, locate files from all three sources
2. Parse each YAML file with `js-yaml`
3. Validate required fields; skip malformed files with a `console.warn` (do not crash)
4. Return `Workflow[]`

```ts
const schWorkflowSource = z.enum(['repo', 'user', 'builtin']);

const schWorkflowArgument = z.enum(['required', 'optional', 'none']);

const schWorkflowTask = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
});

const schWorkflow = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // argument field is optional in the YAML; workflow-loader.ts auto-detects if omitted:
  // 'required' if any prompt contains {{argument}}, otherwise 'none'
  argument: schWorkflowArgument.optional(),
  tasks: z.array(schWorkflowTask).min(1),
  source: schWorkflowSource,
  // sourceLabel is derived at display time via a WorkflowSource → string utility map,
  // not stored in the object
});

type WorkflowSource = z.infer<typeof schWorkflowSource>;
type WorkflowArgument = z.infer<typeof schWorkflowArgument>;
type WorkflowTask = z.infer<typeof schWorkflowTask>;
type Workflow = z.infer<typeof schWorkflow>;
```

### `.george-foreman/` per-repo config directory

Lives inside each user's repo (not the george-foreman app repo). Git-ignored or committed —
user's choice.

```text
<repo>/.george-foreman/
├── workflows/          # Repo-specific workflow YAMLs
│   └── *.yml
└── copy-files          # Plain-text glob list for gitignored file copying
```

#### `copy-files` format

One glob pattern per line. Blank lines and lines starting with `#` are ignored.
Patterns match files relative to the repo root.

Example:

```text
# Secrets and local config
.env
.env.*
.env.local
.secrets
```

#### File-copy fallback chain

When creating a worktree, determine which globs to use for copying gitignored files:

1. If `<repoPath>/.george-foreman/copy-files` exists → use its globs
2. Else if `config.defaultCopyGlobs` is non-empty → use those globs
3. Else → use hardcoded default: `.env`, `.env.*`, `.env.local`

---

## 10. Job Creation Flow

### UI steps

```text
Step 1 — Select repo
  • List of all scanned repos
  • Each row: repo name + default branch
  • Search/filter by repo name
  • Default selection: the repo used by the most recently created job; if no jobs exist yet,
    default to the first repo alphabetically

Step 2 — Select workflow
  • Grouped: Repo workflows | User workflows | Built-in
  • Each row: workflow name + description + task count
  • Search/filter by name + description
  • Default selection: the workflow used by the most recently created job; if no jobs exist yet,
    default to the first workflow in the list

Step 3 — Enter argument
  • Shown only when workflow.argument !== 'none'
  • Required (non-empty) when workflow.argument === 'required'
  • Optional (may be blank) when workflow.argument === 'optional'
  • Hidden entirely when workflow.argument === 'none'; step 3 is skipped, flow goes 2 → 4
  • Label: "Argument"
  • Placeholder: "e.g. AV-123, the auth module, ..."
  • Branch name preview updates live as user types

Step 4 — Confirm
  • Read-only: repo, workflow, argument
  • Editable: branch name (pre-filled by slug generation)
  • "Advanced options" (collapsed by default):
      - Base branch selector (dropdown of branches from the repo; default: repo.defaultBranch)
  • Inline validation: branch name uniqueness across active jobs; valid git ref format
  • "Create Job" button → triggers job creation sequence
```

### Branch slug generation

`<local-slug>` = slugify(argument):

- Replace spaces and underscores with `-`
- Remove characters that are not alphanumeric or `-`
- Collapse consecutive `-` into one
- Trim leading/trailing `-`
- **Do not lowercase** — casing is preserved in the slug

`<workflow-slug>` = slugify(workflow.name) — same rules applied to the workflow name.

Used as the suffix for AV ticket branches so the branch reflects what the workflow does
rather than repeating the ticket number (e.g. `AV-123/Implement-Feature`).

**When `workflow.argument === 'none'` (no argument input shown):**

The argument is empty, so `<local-slug>` would be empty. In this case the branch pattern
uses `<workflow-slug>` only — no `/<local-slug>` suffix:

| Condition                                       | Branch pattern                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| AV pattern + no argument                        | `AV-<ARGUMENT>/<workflow-slug>` is not applicable; falls through to none-of-the-above |
| Workflow keyword match (bugfix, refactor, etc.) | `<prefix>/<workflow-slug>` (e.g. `bugfix/Fix-Login`)                                  |
| None of the above                               | `<github-handle>/<workflow-slug>` (e.g. `pdoucefy/Implement-Feature`)                 |

The user can still edit the full branch name at step 4.

Examples:

| Input              | Output (`<local-slug>`) |
| ------------------ | ----------------------- |
| `AV-123`           | `AV-123`                |
| `the auth module`  | `the-auth-module`       |
| `Fix: weird bug!!` | `Fix-weird-bug`         |
| `_ spaces  -`      | `spaces`                |

### Branch prefix selection (first match wins, top to bottom)

All keyword matches are case-insensitive.

| Condition                                                                                | Branch pattern                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Argument matches `/^AV-\d+$/i`                                                           | `<local-slug>/<workflow-slug>` (e.g. argument `AV-123` + workflow "Implement Feature" → `AV-123/Implement-Feature`) |
| Workflow `name` contains `bugfix`                                                        | `bugfix/<local-slug>`                                                                                               |
| Workflow `name` contains `refactor`                                                      | `refactor/<local-slug>`                                                                                             |
| Workflow `name` contains `devx`, `dev-x`, `devexp`, `dev-exp`, or `developer-experience` | `devX/<local-slug>`                                                                                                 |
| Workflow `name` contains `hotfix`                                                        | `hotfix/<local-slug>`                                                                                               |
| Workflow `name` contains `chore`                                                         | `chore/<local-slug>`                                                                                                |
| Workflow `name` contains `docs`                                                          | `docs/<local-slug>`                                                                                                 |
| None of the above                                                                        | `<github-handle>/<local-slug>`                                                                                      |

### Branch name constraints

- Editable by user at step 4 before any worktree is created
- **Permanent** after confirmation — never renamed by app or orchestrator
- Must be unique across **active jobs only** (`running`, `needs_attention`, `pending`)
  - Archived/completed/failed/stopped jobs do not block reuse of a branch name
- Validated against `/^[a-zA-Z0-9._\-\/]+$/` (valid git ref characters)
- Max length: 250 characters (git limit)
- Inline error if invalid or duplicate shown at step 4

### Job creation sequence

On "Create Job" click:

1. Generate `jobId = 'job-' + crypto.randomUUID()`
2. Persist job with status `pending` to `electron-store`
3. Send `job:created` IPC to renderer
4. Create Git worktree (§11)
5. Copy gitignored files (§11)
6. Spawn `opencode serve` (§12)
7. Poll `/global/health` until ready (§12)
8. `POST /session` → get `orchestratorSessionId`
9. `POST /session/:id/prompt_async` → send workflow + argument
10. Subscribe to `GET /event` SSE stream
11. Update job status to `running`, persist, send `job:updated` IPC

If any step fails:

- Kill any spawned process
- Remove worktree if it was created (`git worktree remove --force`)
- Mark job `failed` with the error message
- Persist, send `job:updated` IPC

### Edge cases

| Scenario                                                | Behavior                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Workflow file deleted between step 2 and step 4         | Validate on Create click; show error "Workflow no longer available" |
| Repo removed from workspace between step 1 and step 4   | Validate on Create click; show error "Repo not found"               |
| Two rapid creates with same branch name                 | Second validate fails with uniqueness error                         |
| Argument is all special characters (slug becomes empty) | Slug falls back to `job-<first-8-chars-of-jobId>`                   |

---

## 11. Git Worktree Management

### Worktree directory path

```text
<workspaceFolder>/<repoName>--<branchSlug>/
```

Where `<branchSlug>` is the full branch name with `/` replaced by `--`.

Examples:

| Repo     | Branch                     | Worktree path                                    |
| -------- | -------------------------- | ------------------------------------------------ |
| `my-app` | `av-123/Implement-Feature` | `<workspace>/my-app--av-123--Implement-Feature/` |
| `my-app` | `pdoucet/fix-weird-bug`    | `<workspace>/my-app--pdoucet--fix-weird-bug/`    |

### Creation

```bash
git -C <repoPath> worktree add <worktreePath> -b <branchName> <baseBranch>
```

Run via `child_process.execFile('git', [...])` (not `exec` — avoids shell injection).

#### Pre-creation check

Before running the command:

1. **Always run `git worktree prune`** unconditionally before every `git worktree add`:
   ```bash
   git -C <repoPath> worktree prune
   ```
   This proactively cleans up stale entries (worktrees deleted manually outside the app)
   and prevents "already registered" errors on subsequent creations. It is cheap and safe
   to run on every creation.
2. If `<worktreePath>` still exists as a directory after pruning → fail with a clear error
   (the directory is real, not stale).
3. Verify `<branchName>` does not already exist in the repo:
   ```bash
   git -C <repoPath> show-ref --verify --quiet refs/heads/<branchName>
   ```
   If it exists → surface as inline validation error at step 4 (not a crash).

### Post-creation: gitignored file copying

After successful `git worktree add`:

1. Determine globs (see §9 file-copy fallback chain)
2. For each glob, expand against `<repoPath>` (not worktreePath) using `fs.promises.glob()` (Node 22 built-in)
3. For each matched file (relative path, not directory):
   - Compute destination: `<worktreePath>/<relativePath>`
   - Ensure destination parent directory exists (`mkdir -p`)
   - Copy file (`fs.copyFile`)
4. If any individual copy fails → `console.warn`, continue (non-fatal)
5. The overall worktree creation is not failed due to copy errors

### Deletion

Worktree deletion follows a two-step process to protect uncommitted work:

**Step 1 — attempt non-forced removal:**

```bash
git -C <repoPath> worktree remove <worktreePath>
```

**Step 2 — if step 1 fails due to uncommitted changes:**

Git returns an error like "contains modified or untracked files". In this case:

- Show a **second confirmation dialog** (distinct from the initial "Delete worktree?" confirm):

  ```text
  ⚠ This worktree has uncommitted changes
  Deleting it will permanently lose any work that hasn't been committed.
  This cannot be undone.

  [Cancel]                    [Force Delete]
  ```

- "Cancel" — closes the dialog, worktree is preserved
- "Force Delete" — runs `git -C <repoPath> worktree remove <worktreePath> --force`

**On successful removal (either step):**

- Update the job record: `worktreeDeleted: true`
- Persist to `electron-store`

**On failure:**

- Run `git worktree prune` as a recovery step to clean up any stale entry
- Surface the original git error in the confirmation dialog

### Edge cases

| Scenario                                           | Behavior                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<worktreePath>` already exists (stale)            | `git worktree prune` runs unconditionally before every create — stale entries are cleaned up proactively; if directory still exists after prune, fail with clear error |
| Branch already exists in repo                      | Inline validation error at step 4: "Branch already exists in this repo. Choose a different name."                                                                      |
| Disk full                                          | Mark job `failed` with OS error message                                                                                                                                |
| Source repo has no remote                          | Creation succeeds; base branch from local branches                                                                                                                     |
| Worktree directory cannot be removed (permissions) | Show error in Archive delete dialog                                                                                                                                    |

---

## 12. OpenCode Process Management

### Spawn command

```bash
opencode serve --port 0 --hostname 127.0.0.1
```

Spawned via `child_process.spawn`:

```ts
spawn('opencode', ['serve', '--port', '0', '--hostname', '127.0.0.1'], {
  cwd: worktreePath,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

- `cwd` is **always** `worktreePath` — opencode uses CWD as its project root
- `env: process.env` — inherits the full environment (preserves PATH, API keys, etc.)
- stdout and stderr are piped for capture

### Port discovery

After spawning, read stdout line-by-line searching for a pattern that indicates the port:

```text
/listening on.*:(\d+)/i
/started.*:(\d+)/i
/:(\d+)/   (fallback — first port-like reference)
```

The captured port is stored in the `jobId → port` map and persisted in `electron-store`.

**Timeout:** if no port is found in stdout within 10 seconds, fall back to port `4096`
(OpenCode's default). If `/global/health` on 4096 responds `{ healthy: true }`, use 4096.
Otherwise, proceed to the 30-second health poll on whatever port was found/assumed.

### Readiness detection

Once port is known:

- Poll `GET http://127.0.0.1:<port>/global/health` every 200ms
- On `{ healthy: true }` → server is ready; proceed to create orchestrator session
- On timeout (30 seconds total from spawn): kill process; mark job `failed` with reason
  `"opencode serve did not become ready within 30 seconds"`

### Process log capture

- All stdout and stderr lines are accumulated in a per-job ring buffer
- Max size: 500 KB per job (when exceeded, oldest lines are dropped)
- Log is written to `electron-store` (`jobLogs[jobId]`) on:
  - Process exit (any exit)
  - Job marked `failed`
- Accessible via `job:get-log` IPC channel
- Displayed in session panel only when job status is `failed`

### Crash handling

Monitor via the process `exit` event:

```text
Process exits unexpectedly (exit code non-zero, or unexpected exit):
  → If crashCount[jobId] === 0:
      Increment crashCount[jobId] to 1
      Wait 1 second
      Re-spawn (same command, same cwd, new port 0)
      Poll /global/health (30s timeout)
      On ready: re-subscribe to SSE; load stored task state; apply new events
      On timeout: mark job 'failed', reason "opencode serve failed to restart"
  → If crashCount[jobId] >= 1:
      Mark job 'failed', reason "opencode serve crashed twice"
      Write process log to electron-store
      Send job:updated IPC
```

Normal exit (exit code 0) when job was stopped intentionally → not treated as crash.

### Stopping a job (user-initiated)

1. Call `POST /session/:id/abort` on the orchestrator session
2. `process.kill('SIGTERM')` on the `opencode serve` process
3. Wait up to 3 seconds for process exit; if still running, `SIGKILL`
4. Mark job status `stopped`; record `completedAt`; `archivedAt` stays `null`
5. Persist; send `job:updated` IPC (job remains on Dashboard for review; user archives manually)

---

## 13. OpenCode HTTP API Client

### Base URL

`http://127.0.0.1:<port>` — port from `jobId → port` map.

Each job has its own HTTP client instance bound to its port.

### All message sends use `prompt_async`

`POST /session/:id/prompt_async` → returns `204 No Content`. The app never waits for a
synchronous response to a message. All responses come through the SSE stream.

### Endpoints used

| Method | Path                                     | Purpose                                  |
| ------ | ---------------------------------------- | ---------------------------------------- |
| `GET`  | `/global/health`                         | Readiness polling after spawn/restart    |
| `GET`  | `/event`                                 | SSE stream — primary real-time mechanism |
| `GET`  | `/session/status`                        | Single poll on SSE reconnect             |
| `POST` | `/session`                               | Create orchestrator session              |
| `POST` | `/session/:id/prompt_async`              | Send initial workflow; answer questions  |
| `POST` | `/session/:id/permissions/:permissionID` | Respond to permission request            |
| `GET`  | `/session/:id/message`                   | Fetch subagent message history on demand |
| `POST` | `/session/:id/abort`                     | Abort session when user stops job        |

### Request format for initial workflow message

```ts
// POST /session/:id/prompt_async
{
  system: ORCHESTRATOR_SYSTEM_PROMPT,
  parts: [
    {
      type: 'text',
      text: buildWorkflowMessage(workflow, argument),
    },
  ],
}
```

Where `buildWorkflowMessage` produces:

```text
Execute the following workflow. Argument: "<argument>"

Tasks:
1. <task 1 name>
   <task 1 prompt with {{argument}} replaced>

2. <task 2 name>
   <task 2 prompt with {{argument}} replaced>

...
```

### Retry policy

- Network error / `ECONNREFUSED`: retry up to 3 times with 500ms between retries
- After 3 failures: mark job `failed` with the last error message
- Non-2xx responses: do not retry; log error body; mark job `failed`
- SSE disconnect: reconnect with exponential backoff — 1s, 2s, 4s, 8s, max 30s per attempt

---

## 14. Job Lifecycle & State Machine

### Job status values

```ts
const schJobStatus = z.enum([
  'pending', // Created in store; worktree + process not yet ready
  'running', // opencode serve healthy; orchestrator active
  'needs_attention', // Waiting for user permission response
  'completed', // All tasks finished successfully
  'failed', // Fatal error (crash × 2, API error, setup failure)
  'stopped', // User manually stopped
]);

type JobStatus = z.infer<typeof schJobStatus>;
```

### Complete Job type

```ts
const schPendingPermission = z.object({
  permissionId: z.string(),
  description: z.string(), // Human-readable (from Permission.title)
  permissionType: z.string(), // e.g. 'bash', 'edit', 'webfetch'
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
});

const schTaskState = z.object({
  index: z.number().int().nonnegative(), // 0-based
  name: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  subagentSessionId: z.string().nullable(),
});

const schJob = z.object({
  id: z.string(), // 'job-<crypto.randomUUID()>'
  repoName: z.string(), // Directory basename of the repo
  repoPath: z.string(), // Absolute path to source repo
  worktreePath: z.string(), // Absolute path to worktree directory.
  // After deletion, this value is RETAINED for display/audit purposes.
  // Always check worktreeDeleted before accessing the filesystem at this path.
  worktreeDeleted: z.boolean(), // true after worktree is deleted; worktreePath still holds old path
  branchName: z.string(), // Full branch name (e.g. 'av-123/the-auth-module')
  baseBranch: z.string(), // Branch the worktree was created from
  workflowName: z.string(), // Display name of the workflow used
  argument: z.string(), // User-supplied argument text
  status: schJobStatus,
  port: z.number().nullable(), // Assigned opencode serve port
  orchestratorSessionId: z.string().nullable(),
  tasks: z.array(schTaskState),
  createdAt: z.number(), // Unix timestamp ms
  completedAt: z.number().nullable(), // Set when status becomes completed/failed/stopped
  archivedAt: z.number().nullable(), // null = on Dashboard; set when user archives or job completes
  errorMessage: z.string().nullable(), // Last error (for failed jobs)
  pendingPermission: schPendingPermission.nullable(),
  // Note: no pendingQuestion field — free-text input is always available while running
});

type PendingPermission = z.infer<typeof schPendingPermission>;
type TaskState = z.infer<typeof schTaskState>;
type Job = z.infer<typeof schJob>;
```

### State transitions

```text
pending
  → running          (opencode serve healthy + orchestrator session created + prompt sent)
  → failed           (any setup step fails: worktree, spawn, health timeout, session create)

running
  → needs_attention  (permission.updated SSE event received)
  → completed        (workflow_completed event OR session.idle fallback — see §16)
  → failed           (crash × 2; API error after retries; session.error event)
  → stopped          (user clicks Stop)

needs_attention
  → running          (user responds to permission request)
  → failed           (crash × 2 while waiting; session.error event)
  → stopped          (user clicks Stop)

completed | failed | stopped
  → (terminal status — no further status transitions)
  → completed: archivedAt set automatically
  → failed / stopped: remain on Dashboard (archivedAt = null) until user archives manually
```

### Active vs archived

**Active** (shown on Dashboard): any job where `archivedAt === null`

- Includes: `pending`, `running`, `needs_attention`, `failed`, `stopped`
- `failed` and `stopped` jobs stay on Dashboard for investigation; user explicitly archives them

**Archived** (shown in Archive tab): any job where `archivedAt !== null`

- `completed` jobs: auto-archived on completion (`archivedAt` set automatically)
- `failed` / `stopped` jobs: manually archived by the user

**Un-archive:** available for `failed` and `stopped` jobs only — clears `archivedAt`, returns job to Dashboard. Not available for `completed` jobs (worktree was auto-deleted on completion).

---

## 15. Real-time Updates (SSE)

### Connection setup

One SSE connection per active job, established in `opencode.ts`:

```ts
// SSE via Node.js http.get with streaming response
// (browser EventSource not available in Electron main process)
http.get(`http://127.0.0.1:${port}/event`, (res) => {
  res.on('data', (chunk) => parseSseChunk(chunk, onEvent));
  res.on('end', onDisconnect);
  res.on('error', onDisconnect);
});
```

### SSE event processing — two distinct pipelines

Each raw SSE message received from `GET /event` is processed through two separate pipelines:

#### Pipeline 1 — `GlobalEvent` wrapper (platform events)

Every SSE message from the OpenCode server is a `GlobalEvent`. The canonical schema is
defined in §16 (`schGlobalEvent`). Pipeline 1 dispatches on `payload.type`:

| `payload.type`         | Action                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `permission.updated`   | Permission detection (see §16); **do not** forward to chat                                              |
| `session.idle`         | Completion/unexpected-termination fallback (see §16); **do not** forward to chat                        |
| `session.error`        | Mark job failed (see §16); **do not** forward to chat                                                   |
| `message.part.updated` | Extract the text delta; run through Pipeline 2; also forward full event to renderer via `sse:event` IPC |
| All other types        | Forward to renderer as `sse:event` IPC for chat display                                                 |

#### Pipeline 2 — Orchestrator structured JSON blocks (within message text)

When a `message.part.updated` event delivers a text delta from the orchestrator session, scan
each line of the text for structured JSON blocks:

- Split the text delta on newlines
- For each line: attempt `JSON.parse(line)`
- If it parses as a valid `OrchestratorEvent` (known `type` field: `task_started`,
  `subagent_spawned`, `task_completed`, `workflow_completed`) → process as structured event
  (see §16); **suppress that line from chat display**
- All other lines → include in chat display

### Reconnect

On disconnect (error or `end`):

1. Wait `Math.min(1000 * 2^attempts, 30000)` ms (exponential backoff, capped at 30s)
2. Reconnect to `GET /event`
3. On successful reconnect:
   - Do a single `GET /session/status` poll
   - Load latest task state from `electron-store`
   - Apply any new events from SSE on top

### No timer-based polling

The app **never** polls any OpenCode API on a scheduled interval. All real-time updates come
from SSE. The only bounded polling is:

- `GET /global/health` during startup/restart (terminates when healthy or on timeout)
- `GET /session/status` once per SSE reconnect (one-shot, not repeated)

---

## 16. Orchestrator Protocol

### System prompt (sent as `system` field on first `prompt_async`)

```text
You are an orchestrator agent for George Foreman, an AI workflow automation system.
You will receive a workflow consisting of named tasks. Execute each task sequentially
by spawning a subagent for each one. Wait for each subagent to complete before
starting the next task.

For each task, spawn a subagent using the appropriate tool, passing it the task's
prompt verbatim. After each subagent completes, assess whether the task succeeded
before proceeding to the next task.

CRITICAL — Structured events:
You MUST emit the following JSON blocks at the exact moments described. Each block
MUST appear on its own dedicated line with NO other text on that line. This is
required for machine parsing by the host application.

When you begin a task (before spawning its subagent):
{"type":"task_started","task_index":<N>,"session_id":"<your own session ID>"}

When you spawn a subagent for a task:
{"type":"subagent_spawned","task_index":<N>,"session_id":"<the subagent session ID>"}

When a task's subagent completes successfully:
{"type":"task_completed","task_index":<N>}

When all tasks are done:
{"type":"workflow_completed"}

Rules:
- task_index is 0-based (first task = index 0)
- Each JSON block must be the only content on its line
- Do not wrap JSON blocks in code fences or add any text before/after on the same line
- Emit task_started BEFORE spawning the subagent
- Emit subagent_spawned immediately after you have the subagent's session ID
- Emit task_completed only after the subagent has finished
- Emit workflow_completed after the last task_completed
```

### Structured event types

```ts
const schOrchestratorEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task_started'),
    task_index: z.number().int().nonnegative(),
    session_id: z.string(),
  }),
  z.object({
    type: z.literal('subagent_spawned'),
    task_index: z.number().int().nonnegative(),
    session_id: z.string(),
  }),
  z.object({ type: z.literal('task_completed'), task_index: z.number().int().nonnegative() }),
  z.object({ type: z.literal('workflow_completed') }),
]);

type OrchestratorEvent = z.infer<typeof schOrchestratorEvent>;
```

### Structured event handling

Parsing: read each line of each SSE message data. If a line independently parses as valid JSON
with a known `type` field from the list above → treat as structured event; suppress from chat
display. All other content (including lines that failed JSON parsing) → display in chat thread.

**On `task_started`:**

- Set `tasks[task_index].status = 'in_progress'`
- Persist to `electron-store`
- Send `job:updated` IPC

**On `subagent_spawned`:**

- Set `tasks[task_index].subagentSessionId = session_id`
- Persist to `electron-store`
- Send `job:updated` IPC

**On `task_completed`:**

- Set `tasks[task_index].status = 'completed'`
- Persist to `electron-store`
- Send `job:updated` IPC

**On `workflow_completed`:**

- Set all remaining `in_progress` or `pending` tasks to `completed`
- Set `job.status = 'completed'`
- Set `job.completedAt = Date.now()`
- Set `job.archivedAt = Date.now()` (completed jobs are auto-archived)
- **Auto-delete the worktree:**
  - Run `git -C <repoPath> worktree remove <worktreePath>` (no `--force`)
  - If it succeeds: set `worktreeDeleted: true`
  - If it fails (uncommitted changes): set `worktreeDeleted: false`; show a persistent
    warning banner on the archived job card in the Archive tab:
    ```text
    ⚠ Worktree not deleted — uncommitted changes detected. Delete manually when ready.
    ```
    The "Delete worktree" option remains available in the overflow menu.
- Persist; send `job:updated` IPC (Zustand moves it to Archive because `archivedAt !== null`)

### Permission detection

OpenCode emits `permission.updated` events through the SSE stream. The full wire shape
(verified from the OpenCode SDK `types.gen.ts`):

```ts
// SSE GlobalEvent wrapper
const schGlobalEvent = z.object({
  directory: z.string(), // project directory path
  payload: z.discriminatedUnion('type', [
    z.object({ type: z.literal('permission.updated'), properties: z.unknown() }),
    z.object({ type: z.literal('session.idle'), properties: z.unknown() }),
    z.object({ type: z.literal('session.error'), properties: z.unknown() }),
    z.object({ type: z.string(), properties: z.unknown() }),
  ]),
});

// Permission (payload.properties for permission.updated events)
const schPermission = z.object({
  id: z.string(), // permissionId — use for POST /permissions/:permissionID
  type: z.string(), // e.g. 'bash', 'edit', 'webfetch', 'doom_loop'
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
  sessionID: z.string(), // session that triggered the permission
  messageID: z.string(),
  callID: z.string().optional(), // tool call that triggered this
  title: z.string(), // human-readable description — display this to user
  metadata: z.record(z.unknown()),
  time: z.object({ created: z.number() }), // unix epoch ms
});

type GlobalEvent = z.infer<typeof schGlobalEvent>;
type Permission = z.infer<typeof schPermission>;
```

When the app receives a `permission.updated` SSE event, check if `properties.sessionID`
matches any session belonging to this job — the orchestrator session **or** any known subagent
session (`job.tasks[].subagentSessionId`):

- Set `job.pendingPermission = { permissionId: p.id, description: p.title, permissionType: p.type, pattern: p.pattern }`
- Set `job.status = 'needs_attention'`
- Persist; send `job:updated` IPC
- If `!app.isFocused()` → fire macOS notification

**Responding to a permission:** call `POST /session/:id/permissions/:permissionID` where
`:id` is `permission.properties.sessionID` (the session that raised the permission — may be
a subagent, not the orchestrator). Using the orchestrator session ID for a subagent permission
would return 404.

**Permission response values** — `POST /session/:id/permissions/:permissionID`:

```ts
// Request body
{
  response: 'once' | 'always' | 'reject';
}

// 'once'   — allow this specific action, once
// 'always' — allow and remember (don't ask again for this type/pattern)
// 'reject' — deny
```

On response sent: clear `job.pendingPermission`; set `job.status = 'running'`; persist.

### `session.idle` fallback completion / unexpected termination

`EventSessionIdle` fires on the orchestrator session when it finishes its turn. Use this as a
fallback in case `workflow_completed` was never emitted:

```ts
const schEventSessionIdle = z.object({
  type: z.literal('session.idle'),
  properties: z.object({ sessionID: z.string() }),
});

type EventSessionIdle = z.infer<typeof schEventSessionIdle>;
```

**On `session.idle` for the orchestrator session:**

- If `job.status === 'needs_attention'` → **ignore** (session going idle while waiting for a
  permission response is expected; do not treat as unexpected termination)
- If `workflow_completed` has already been received → ignore (already handled)
- Else if `job.status === 'running'` AND all tasks have `status === 'completed'`:
  - Mark job `completed`, set `completedAt`, set `archivedAt = Date.now()`
  - Auto-delete worktree (same logic as `workflow_completed` above)
  - Persist; send `job:updated` IPC (Zustand moves to Archive because `archivedAt !== null`)
- Else if `job.status === 'running'` AND tasks are incomplete:
  - The orchestrator is paused mid-workflow, likely waiting for user input
  - Do **not** mark the job `failed`
  - Show the **"Waiting for your input…"** hint in the free-text input placeholder (see §19)
  - If `!app.isFocused()` → fire macOS notification:
    ```text
    Title: Input Required
    Body:  "<workflow name>" on <repo name> is waiting for your input.
    ```
  - Job stays `running`; user can send a free-text message to resume the orchestrator
  - Job only transitions to `failed` if `session.error` fires, or if the user stops it

### `session.error` — structured error from orchestrator

```ts
const schEventSessionError = z.object({
  type: z.literal('session.error'),
  properties: z.record(z.unknown()), // shape not fully documented; parse defensively
});

type EventSessionError = z.infer<typeof schEventSessionError>;
```

**On `session.error` for the orchestrator session:**

- Mark job `failed` with the error message from the event
- Persist; send `job:updated` IPC

### Free-text messaging (always available while running)

There is no structured "waiting for question" event in the OpenCode protocol. Instead, the
free-text input is **always visible** when `job.status === 'running'`. The user can message the
orchestrator at any time.

When `session.idle` fires and the job is still `running` (no `workflow_completed` received,
not all tasks complete), the input area shows a subtle hint: **"Waiting for your input…"** to
signal the orchestrator is paused and expects a response.

Sending a free-text message: `POST /session/:id/prompt_async` with the user's text.
No status change required — job stays `running`.

---

## 17. Job State Persistence (electron-store)

### Installation

```bash
pnpm add electron-store
```

### Complete store schema

```ts
const schWindowBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const schConfig = z.object({
  workspaceFolder: z.string(),
  githubHandle: z.string(),
  userWorkflowsFolder: z.string().nullable(),
  defaultCopyGlobs: z.string(), // Newline-separated glob patterns
  windowBounds: schWindowBounds.nullable(),
});

const schStore = z.object({
  schemaVersion: z.literal(1),
  config: schConfig,
  jobs: z.record(schJob), // keyed by jobId
  jobLogs: z.record(z.string()), // keyed by jobId — accumulated stdout+stderr
});

type Config = z.infer<typeof schConfig>;
type StoreSchema = z.infer<typeof schStore>;
```

### Schema versioning and migration

On app startup, in `store.ts`:

```ts
const CURRENT_SCHEMA_VERSION = 1;

const stored = store.get('schemaVersion');
if (stored !== CURRENT_SCHEMA_VERSION) {
  // Clear all job data; preserve config if it exists
  const config = store.get('config');
  store.clear();
  if (config) store.set('config', config);
  store.set('schemaVersion', CURRENT_SCHEMA_VERSION);
}
```

Rationale: no production data to preserve in v1. Config is preserved across migrations.

### Write triggers

Write to `electron-store` on every:

- Job creation (initial `pending` state)
- Job status change
- `task_started` / `subagent_spawned` / `task_completed` / `workflow_completed` events
- Job moved to archive (completed/failed/stopped)
- Process log update on crash/exit
- Settings change (each field, debounced 500ms)
- Window bounds change (debounced 1s)

### Read triggers

- App startup: load all jobs, config, schema version
- SSE reconnect: reload task state for the reconnecting job, apply new events on top

---

## 18. IPC Contract

Defined in `src/shared/ipc.ts`. Implemented in `src/preload/index.ts` via `contextBridge`.

### Conventions

- **Renderer → Main (invoke):** `ipcRenderer.invoke(channel, args)` ↔ `ipcMain.handle(channel, handler)`
- **Main → Renderer (push):** `webContents.send(channel, data)` ↔ `ipcRenderer.on(channel, handler)`
- Channel naming: `<domain>:<action>`

### Renderer → Main (invoke)

```ts
// Workspace
'workspace:scan'
  → () => Promise<Repo[]>

// Workflows
'workflow:list'
  → (repoPath: string) => Promise<Workflow[]>

// Settings
'settings:get'
  → () => Promise<Config>
'settings:set'
  → (partial: Partial<Config>) => Promise<void>

// Binary check
'binary:check'
  → () => Promise<{ found: boolean; path?: string }>
'binary:recheck'
  → () => Promise<{ found: boolean; path?: string }>
  // On found: also triggers auto-resume of any blocked jobs

// Dialog helpers
'dialog:open-directory'
  → () => Promise<string | null>
  // Returns selected path or null if cancelled

// Job management
'job:create'
  → (params: JobCreateParams) => Promise<Job>
'job:stop'
  → (jobId: string) => Promise<void>
'job:archive'
  → (jobId: string) => Promise<void>
  // Sets archivedAt = Date.now() on a failed or stopped job; moves to Archive tab
'job:unarchive'
  → (jobId: string) => Promise<void>
  // Clears archivedAt; returns failed/stopped job to Dashboard; not valid for completed
'job:list-active'
  → () => Promise<Job[]>
  // Returns jobs where archivedAt === null
'job:list-archive'
  → () => Promise<Job[]>
  // Returns jobs where archivedAt !== null
'job:delete-worktree'
  → (jobId: string) => Promise<{ success: boolean; hasUncommittedChanges?: boolean; error?: string }>
  // Step 1: attempts git worktree remove (no --force)
  // On success: { success: true }
  // On uncommitted changes: { success: false, hasUncommittedChanges: true, error: '...' }
  // On other failure: { success: false, error: '...' }
'job:delete-worktree-force'
  → (jobId: string) => Promise<{ success: boolean; error?: string }>
  // Step 2: attempts git worktree remove --force (only called after user confirms Force Delete)
'job:get-log'
  → (jobId: string) => Promise<string>

// Permission response
'permission:respond'
  → (params: { jobId: string; permissionId: string; response: 'once' | 'always' | 'reject' }) => Promise<void>

// Free-text message to orchestrator (always available while running)
'message:send'
  → (params: { jobId: string; text: string }) => Promise<void>

// Subagent drill-down
'session:messages'
  → (params: { jobId: string; sessionId: string }) => Promise<SessionMessage[]>

// Branch name utilities
'branch:validate'
  → (params: { repoPath: string; branchName: string; activeJobIds: string[] })
     => Promise<{ valid: boolean; error?: string }>
'branch:preview'
  → (params: { argument: string; workflowName: string; githubHandle: string })
     => Promise<string>

// Repo helpers
'repo:list-branches'
  → (repoPath: string) => Promise<string[]>
  // Returns sorted unique list of local + remote branch names (remote prefix stripped)
  // e.g. ['main', 'dev', 'feature/foo'] — used to populate base-branch dropdown

// Onboarding
'onboarding:is-complete'
  → () => Promise<boolean>
'onboarding:complete'
  → (params: { workspaceFolder: string; githubHandle: string }) => Promise<void>
```

### Main → Renderer (push)

```ts
// Job state updates
'job:created'         → (job: Job) => void
'job:updated'         → (job: Job) => void
// job:archived is not needed — archive state is derived from job.archivedAt via job:updated

// SSE event forwarding
'sse:event'           → (params: { jobId: string; event: unknown }) => void
  // Raw SSE event data (non-structured) for chat display

'sse:orchestrator-event'
                      → (params: { jobId: string; event: OrchestratorEvent }) => void
  // Structured orchestrator events (task_started, etc.)

// Binary status
'binary:status'       → (params: { found: boolean }) => void

// Workspace rescan result
'workspace:updated'   → (repos: Repo[]) => void

// Navigation (from notification click or tray menu)
'navigate:job'        → (jobId: string) => void
'navigate:settings'   → () => void    // Tray "Settings" menu item → show Settings panel
```

### Types in `src/shared/types.ts`

All types from §9, §10, §14, plus:

```ts
const schJobCreateParams = z.object({
  repoPath: z.string(),
  workflowName: z.string(),
  workflowTasks: z.array(schWorkflowTask),
  argument: z.string(),
  branchName: z.string(),
  baseBranch: z.string(),
});

const schMessagePart = z.object({
  type: z.enum(['text', 'tool_call', 'tool_result']),
  text: z.string().optional(),
});

const schSessionMessage = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  parts: z.array(schMessagePart),
  createdAt: z.number(),
});

type JobCreateParams = z.infer<typeof schJobCreateParams>;
type MessagePart = z.infer<typeof schMessagePart>;
type SessionMessage = z.infer<typeof schSessionMessage>;
```

---

## 19. UI Structure

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

### Tray

- Icon: programmatic 22×22 flame PNG via `nativeImage.createFromDataURL`
- Badge: `tray.setTitle(count > 0 ? String(count) : '')` where count = `needs_attention` jobs
  - Updated on every job status change; always current regardless of window visibility
- Left-click: toggle window visibility
- Right-click context menu:
  - "Show" → `mainWindow.show(); mainWindow.focus()`
  - "Settings" → show Settings panel
  - _(separator)_
  - "Quit" → `app.quit()`

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
- Status pill color per §4 Status Pill Colors
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
    triggers two-step confirmation (see §11)

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
    (hidden once deleted); uses two-step confirmation (see §11)
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
GitHub Handle     [pdoucefy                     ]
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

## 20. Notification System

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

### Tray badge

- `tray.setTitle(String(count))` where count = `needs_attention` jobs (empty string when 0)
- Recalculated on every job status change
- Always current regardless of window focus or visibility

---

## 21. Error Handling & Failure Modes

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

## 22. Coding Patterns & Conventions

### Module design

- **Pure functions for testability** — any logic that doesn't require Electron APIs is extracted
  into a dedicated module and tested independently of Electron
- **`index.ts` is thin wiring only** — creates Electron app/window/tray objects, wires event
  listeners, calls pure helper modules. No business logic.
- Established pattern from M1: `tray-icon.ts` (pure) and `window.ts` (pure) tested without
  mocking Electron

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
- Pinned to ESLint v9 — **do not upgrade** (see §27)
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
- Renderer form validation — keep that as simple inline checks per the form specs in §6, §7, §10

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

### Renderer state management (Zustand)

The renderer uses **Zustand** for global state. One store (`src/renderer/src/store.ts`) holds
all shared state and is the single subscriber to IPC push events from main.

```ts
type AppStore = {
  // Repos
  repos: Repo[];
  setRepos: (repos: Repo[]) => void;

  // Jobs — single map; active/archived derived from archivedAt field
  jobs: Record<string, Job>;
  upsertJob: (job: Job) => void;
  // Derived selectors (not stored — computed from jobs map):
  // activeJobs  = Object.values(jobs).filter(j => j.archivedAt === null)
  // archivedJobs = Object.values(jobs).filter(j => j.archivedAt !== null)

  // UI state
  selectedJobId: string | null;
  selectJob: (jobId: string | null) => void;
  activeTab: 'dashboard' | 'archive';
  setActiveTab: (tab: 'dashboard' | 'archive') => void;
  showSettings: boolean; // true when Settings panel is visible
  setShowSettings: (show: boolean) => void;

  // Binary check
  binaryFound: boolean | null; // null = not yet checked
  setBinaryFound: (found: boolean) => void;
};
```

IPC listeners are registered **once** in `App.tsx` (or a top-level `useEffect`) and call Zustand
setters:

```ts
// All job state changes come through job:updated — a single upsertJob handles everything.
// Active vs archived is derived from job.archivedAt, not from separate IPC channels.
window.api.onJobCreated((job) => useAppStore.getState().upsertJob(job));
window.api.onJobUpdated((job) => useAppStore.getState().upsertJob(job));
window.api.onWorkspaceUpdated((repos) => useAppStore.getState().setRepos(repos));
window.api.onBinaryStatus(({ found }) => useAppStore.getState().setBinaryFound(found));
window.api.onNavigateJob((jobId) => {
  useAppStore.getState().setShowSettings(false);
  useAppStore.getState().setActiveTab('dashboard');
  useAppStore.getState().selectJob(jobId);
});
window.api.onNavigateSettings(() => {
  useAppStore.getState().setShowSettings(true);
});
// SSE events are subscribed per-job in the ChatThread component via onSseEvent,
// not in the global Zustand wiring.
```

### `window.api` — typed IPC bridge

`src/preload/index.ts` exposes a single `window.api` object via `contextBridge`. No raw
channel strings appear in renderer code.

```ts
// Shape of window.api (defined in preload, declared in src/shared/types.ts for TypeScript)
type ElectronAPI = {
  // Invoke (renderer → main, returns Promise)
  workspace: {
    scan: () => Promise<Repo[]>;
  };
  workflow: {
    list: (repoPath: string) => Promise<Workflow[]>;
  };
  settings: {
    get: () => Promise<Config>;
    set: (partial: Partial<Config>) => Promise<void>;
  };
  binary: {
    check: () => Promise<{ found: boolean; path?: string }>;
    recheck: () => Promise<{ found: boolean; path?: string }>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  job: {
    create: (params: JobCreateParams) => Promise<Job>;
    stop: (jobId: string) => Promise<void>;
    archive: (jobId: string) => Promise<void>; // failed/stopped only
    unarchive: (jobId: string) => Promise<void>; // failed/stopped only; not for completed
    listActive: () => Promise<Job[]>; // archivedAt === null
    listArchive: () => Promise<Job[]>; // archivedAt !== null
    deleteWorktree: (
      jobId: string,
    ) => Promise<{ success: boolean; hasUncommittedChanges?: boolean; error?: string }>;
    deleteWorktreeForce: (jobId: string) => Promise<{ success: boolean; error?: string }>;
    getLog: (jobId: string) => Promise<string>;
  };
  permission: {
    respond: (params: {
      jobId: string;
      permissionId: string;
      response: 'once' | 'always' | 'reject';
    }) => Promise<void>;
  };
  message: {
    send: (params: { jobId: string; text: string }) => Promise<void>;
  };
  session: {
    messages: (params: { jobId: string; sessionId: string }) => Promise<SessionMessage[]>;
  };
  branch: {
    validate: (params: {
      repoPath: string;
      branchName: string;
      activeJobIds: string[];
    }) => Promise<{ valid: boolean; error?: string }>;
    preview: (params: {
      argument: string;
      workflowName: string;
      githubHandle: string;
    }) => Promise<string>;
  };
  repo: {
    listBranches: (repoPath: string) => Promise<string[]>;
    // Sorted unique local + remote branch names; used for base-branch dropdown
  };
  onboarding: {
    isComplete: () => Promise<boolean>;
    complete: (params: { workspaceFolder: string; githubHandle: string }) => Promise<void>;
  };

  // Subscribe (main → renderer, returns unsubscribe function)
  onJobCreated: (cb: (job: Job) => void) => () => void;
  onJobUpdated: (cb: (job: Job) => void) => () => void;
  // onJobArchived removed — archive state derived from job.archivedAt in onJobUpdated
  onSseEvent: (cb: (params: { jobId: string; event: unknown }) => void) => () => void;
  onSseOrchestratorEvent: (
    cb: (params: { jobId: string; event: OrchestratorEvent }) => void,
  ) => () => void;
  onBinaryStatus: (cb: (params: { found: boolean }) => void) => () => void;
  onWorkspaceUpdated: (cb: (repos: Repo[]) => void) => () => void;
  onNavigateJob: (cb: (jobId: string) => void) => () => void;
  onNavigateSettings: (cb: () => void) => () => void; // Tray "Settings" → show Settings panel
};

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
```

---

## 23. Testing Strategy

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
| `tray-icon.ts`        | _(already done)_ PNG magic bytes, data URL format, icon size                                                                                                           |
| `window.ts`           | _(already done)_ hide/quit decision, single-instance decision                                                                                                          |
| `binary-check.ts`     | `opencode` found on PATH; not found; path returned correctly                                                                                                           |
| `workspace.ts`        | `.git` dir included; `.git` file (worktree) excluded; symlink included; missing folder returns empty; default branch detection from `symbolic-ref`; fallback to `main` |
| `workflow-loader.ts`  | Loads valid YAML; skips malformed files; source labeling; `{{argument}}` substitution; merges all three sources; empty sources return empty arrays                     |
| `worktree.ts`         | Path generation (branch `/` → `--`); command construction; `execFile` args; error propagation                                                                          |
| `opencode-process.ts` | Port discovery from stdout; fallback to 4096; crash count increment; second crash → `failed`; SIGTERM then SIGKILL sequence                                            |
| `store.ts`            | Schema version migration clears jobs preserves config; typed get/set round-trips                                                                                       |
| `notifications.ts`    | Permission notification content + `isFocused` gate; `session.idle` pause notification content + `isFocused` gate; no notification when app is focused                  |
| `job-manager.ts`      | State transitions (all from §14); startup restore logic                                                                                                                |
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

## 24. Build & Packaging

### Development

```bash
pnpm dev       # electron-vite dev — hot reload
pnpm build     # electron-vite build → out/
pnpm preview   # preview production build
```

### Local packaging (personal use)

Produces an unsigned `.dmg` for running on your own machine. No Apple Developer account,
no signing, no notarization required — macOS does not block apps you build locally from source.

```bash
pnpm add -D electron-builder
```

`electron-builder` config (add to `package.json`):

```json
"build": {
  "appId": "com.anomaly.george-foreman",
  "productName": "George Foreman",
  "directories": {
    "buildResources": "resources",
    "output": "release/${version}"
  },
  "files": [
    "out/**/*",
    "workflows/**/*"
  ],
  "extraMetadata": {
    "main": "./out/main/index.js"
  },
  "mac": {
    "target": [
      { "target": "dmg", "arch": ["arm64", "x64"] }
    ],
    "category": "public.app-category.productivity"
  }
}
```

### Build scripts

```json
"package": "pnpm build && electron-builder --mac"
```

Run `pnpm package` to produce a `.dmg` in `release/`. Double-click to install on your own Mac.

---

## 25. CI Pipeline

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
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
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

## 26. Dependencies

### Production dependencies to add

```bash
pnpm add electron-store js-yaml zustand zod lucide-react
```

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

**Never run `pnpm approve-builds`** — see §27.

---

## 27. Known Gotchas

### ESLint v9 pinned

`eslint-plugin-react@7` is incompatible with ESLint v10. We are pinned to ESLint v9 until
`eslint-plugin-react@8` ships with flat config support. Do not upgrade ESLint past v9 until
this is resolved.

### `pnpm approve-builds` duplicates YAML keys

**Never run `pnpm approve-builds` or `pnpm approve-builds --all`.** It appends to
`pnpm-workspace.yaml` without deduplication, creating duplicate YAML keys that break
`pnpm install`. Add new `allowBuilds` entries manually.

### Git worktree directory name is permanent

`git worktree add` fixes the directory path at creation time. It can never be renamed. The app
must never attempt to rename the worktree directory or the branch.

### `--port 0` requires reading stdout for the actual port

The OS assigns a random port when `opencode serve --port 0` is launched. The app must parse
stdout to discover which port was assigned before making any API calls.

### `opencode serve` CWD must be the worktree path

`opencode serve` uses its CWD as the project root. Always spawn with `cwd: worktreePath`.
Spawning from a different directory will cause OpenCode to operate on the wrong codebase.

### `EventSource` is not available in the Electron main process

The browser `EventSource` API is not available in Node.js. The SSE client is implemented
using `http.get` with a streaming response and a line-buffer parser (see §15). Do not
use the browser `EventSource` class or add the `eventsource` npm package — the custom
approach is already specced and handles chunk-boundary splitting correctly.

### macOS only — no cross-platform guards needed

This app targets macOS exclusively. `app.dock`, `Tray.setTitle()`, macOS notifications, and
`nativeImage` are used without platform guards.

### `electron-store` is a process-wide singleton

All jobs share one `electron-store` instance. Job data lives under the `jobs` map keyed by
`jobId`. Concurrent writes from multiple concurrent async job operations should be serialized
to avoid partial writes (write one job at a time to the store, or use a write queue).

### Two repos with the same directory name is unsupported

The worktree path is `<workspace>/<repoName>--<branchSlug>`. If two repos in the workspace
share the same directory basename (possible with symlinks pointing to differently-named
directories) and the user creates jobs with the same branch name in both, the worktree paths
would collide. This is a known limitation — if it occurs, `git worktree add` fails with an OS
error, which is surfaced in the job error message. The fix is to rename one of the repos.

### `session.idle` fires for all sessions, not just the orchestrator

The `session.idle` SSE event fires for every session including subagents. The app must filter
by `properties.sessionID === job.orchestratorSessionId` before using it as a completion
fallback.

---

## 28. Implementation Milestones

Implement in this order. Mark `[x]` when complete.

- [x] **M1.** Electron shell + tray (programmatic flame icon) + window hide-on-close + right-click tray menu (Show / Quit) + single-instance lock
- [x] **M2.** Make repo public on GitHub (enables the `workflow-schema.json` public URL) + CI pipeline: `.github/workflows/ci.yml`
- [ ] **M3.** Local packaging: `electron-builder` config in `package.json` + `pnpm package` script producing unsigned `.dmg`
- [ ] **M4.** `electron-store` setup: schema v1, all typed accessors, schema-version migration logic
- [ ] **M5.** Design system: `theme.ts` tokens (colors, fonts, spacing), `GlobalStyle.ts`, font imports (`@fontsource`) — applied from this milestone onward
- [ ] **M6.** UI component library (`src/renderer/src/components/ui/`):
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
- [ ] **M7.** First-launch onboarding (2-step: workspace folder + GitHub handle) + `opencode` binary startup check + persistent error banner
- [ ] **M8.** Workspace scanning (`workspace.ts`): `.git` dir detection, symlink support, default branch detection
- [ ] **M9.** Workflow YAML loading (`workflow-loader.ts`): all three sources + `.george-foreman/` parsing + `{{argument}}` substitution + validation + create `workflows/workflow-schema.json`
- [ ] **M10.** Git worktree management (`worktree.ts`): create, delete, path generation, pre-creation checks, `.george-foreman/copy-files` file copying
- [ ] **M11.** OpenCode process management (`opencode-process.ts`): spawn, port discovery, health polling, crash handling (one auto-restart, then fail), process log capture (ring buffer)
- [ ] **M12.** OpenCode HTTP API client (`opencode.ts`): all endpoints, retry logic, SSE client (Node.js streaming), reconnect + status poll
- [ ] **M13.** Job creation flow — UI only (steps 1–4): repo select, workflow select, argument input, branch name preview + confirm + advanced base-branch selector
- [ ] **M14.** Job manager (`job-manager.ts`): state machine, full job creation orchestration (steps 4→10 from §10), crash handling, startup restore + auto-resume
- [ ] **M15.** IPC bridge (`src/shared/ipc.ts`, `src/shared/types.ts`, `src/preload/index.ts`): all channels, fully typed `window.api` object; Zustand store skeleton (`src/renderer/src/store.ts`)
- [ ] **M16.** `DashboardTab` + `Layout`: repo grouping, job cards (status pill, progress bar, elapsed time), split-panel shell, session panel skeleton
- [ ] **M17.** Session panel: two-column layout, task list with status icons + background tints, expandable subagent rows (lazy-load messages), chat thread (auto-scroll, scroll-lock)
- [ ] **M18.** Input area: permission mode (3 buttons: Reject / Allow Once / Allow Always) + persistent free-text input (always shown when running; "Waiting for your input…" hint on session.idle)
- [ ] **M19.** Attention detection: tray badge update + macOS notifications (isFocused gate) + notification click → navigate to job
- [ ] **M20.** `ArchiveTab`: status filter tabs, search, virtual scrolling, archive/unarchive actions, worktree delete (with two-step confirmation)
- [ ] **M21.** Settings UI: all four fields, Browse dialogs, Rescan button, auto-save, back navigation, `Cmd+,` shortcut

---

## 29. Future / Backlog

Not in scope for the current build. Captured here to avoid re-litigating.

- **Repo-specific configs** — additional per-repo config (default model, branch prefix overrides, etc.)
- **Additional themes** — the design token system in `theme.ts` is designed to make
  theme variants straightforward. Potential themes: "Grill/BBQ" (warm amber, charcoal),
  "Futuristic orange" (neon, dark), "Clean steel" (minimal, neutral). Theme switcher in
  Settings.
- **TDD workflows** — specialized workflow type that verifies all changes pass tests + builds
  and fully implement the requested feature including undocumented edge cases
- **Re-run from Archive** — "Re-run" clones the job config and starts a new job, preserving
  the original in archive (currently: archive is read-only history)
- **Notification on completion** — optional macOS notification when a job completes (currently:
  only `needs_attention` fires a notification)
- **Workflow argument schema** — structured argument definitions (multiple named params, types,
  validation) declared in the YAML; currently a single free-text `{{argument}}`
- **Job templates** — save a job config (repo + workflow + argument) as a named template for
  quick reuse
- **OAuth GitHub integration** — replace plain-text GitHub handle with OAuth login; enables PR
  creation, issue linking, richer branch metadata
- **Per-repo `.george-foreman/` extended config** — beyond workflows and copy-files: default
  model, branch prefix overrides, custom opencode rules/tools
- **Per-repo OpenCode config controls** — structured fields (not a raw JSON editor) for the
  OpenCode settings George Foreman most needs to influence on a per-repo basis:
  - Model selection for the orchestrator (provider + model ID)
  - Permission defaults (pre-allow `bash` / `edit` / `webfetch` so jobs don't keep prompting)
    Stored as `.george-foreman/opencode-config.json`, which is merged or copied into the worktree
    at creation time alongside `.env` files. A raw JSON editor is explicitly out of scope —
    structured UI controls for specific knobs only.
- **Concurrent job limit** — currently unlimited; future: user-configurable soft limit in
  Settings with UI enforcement
- **Jira ticket title lookup for AV branch names** — currently AV branches use the workflow
  name as the slug (e.g. `AV-123/Implement-Feature`). Future: look up the Jira ticket title
  via a CLI (e.g. `jira issue view AV-123 --json`) and use it as the second slug instead
  (e.g. `AV-123/implement-oauth-login`). Requires: deciding on a Jira CLI/API integration
  strategy, handling auth, network latency in the branch preview, and graceful fallback to
  the workflow-slug approach when the CLI is unavailable or the ticket doesn't exist.
- **User-visible diagnostic log / warnings panel** — currently, non-fatal issues (malformed
  workflow YAML files, failed file copies, skipped `.george-foreman/copy-files` globs,
  `console.warn` calls throughout) are silent to the user and only visible in dev tools or
  stdout. Future work: a dedicated "Diagnostics" or "Warnings" panel (accessible from Settings
  or a tray menu item) that surfaces:
  - Workflow files that failed to parse (with file path + parse error)
  - Files that failed to copy into a worktree (with glob pattern + error)
  - Any non-fatal startup warnings (e.g. user workflows folder not found)
  - Structured log of recent app-level events for debugging
    This would let users fix their configs and workflows without needing to open dev tools.
- **Browser-like navigation** — macOS two-finger swipe back/forward and mouse back/forward
  buttons currently do nothing (no client-side router, no history entries pushed). Future work:
  introduce a navigation history stack covering: Settings ↔ tabs, job card selection, session
  panel drill-down (expanded subagent rows). Swipe/mouse-back would unwind this stack naturally.
  Would require either a lightweight client-side router (e.g. `react-router`) or a custom
  `history.pushState` / `popstate` implementation integrated with the Zustand store.
- **macOS code signing + notarization + distribution** — required only if distributing the app
  to other users' Macs. Needs an Apple Developer Program membership ($99/year). The chain:
  Developer ID certificate (`CSC_LINK` + `CSC_KEY_PASSWORD`) → sign the `.app` →
  notarize with Apple (`APPLE_ID` + `APPLE_ID_PASSWORD` + `APPLE_TEAM_ID`) → staple ticket →
  distribute `.dmg`. Add `release.yml` GitHub Actions workflow + `electron-builder` notarize
  config when needed. Not required for personal use — unsigned local builds work fine on your
  own machine.
- **Windows / Linux support** — the app currently targets macOS exclusively. APIs used without
  cross-platform guards: `app.dock`, `Tray.setTitle()` (badge), macOS notifications, and
  `nativeImage`. Future work: audit all macOS-specific API calls, add platform guards, replace
  or polyfill where needed (e.g. Windows tray badge via overlay icon, Linux notifications via
  `libnotify`). Would also require Windows/Linux CI runners and packaging targets in
  `electron-builder` config.
- **Mode Selection** - Allow users to select the starting agent mode (ie build/plan) when creating a new job. This would require adding a new field to the workflow YAML schema, updating the UI to allow users to select the mode, and passing this information to the OpenCode orchestrator when creating the job.

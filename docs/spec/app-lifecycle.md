# App Startup & Lifecycle / Onboarding / Settings

## App Startup & Lifecycle

### Single-instance lock

The app uses `app.requestSingleInstanceLock()`. If a second instance is launched, it quits
immediately and the first instance's window is focused (`mainWindow.show(); mainWindow.focus()`).

### Startup sequence (every launch)

```text
app.whenReady()
  → createWindow()          — create BrowserWindow (hidden initially)
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

- **Window hide on close:** `close` event intercepted; if `!isQuitting`, `event.preventDefault()` + `mainWindow.hide()` + `app.dock.hide()`
- **Dock click:** shows and focuses the window (`app.dock.show()` + `mainWindow.show()` + `mainWindow.focus()`) — standard macOS behavior, no handler needed
- **`Cmd+,`:** opens Settings — registered via `app.applicationMenu` accelerator; sends `navigate:settings` IPC to renderer
- **Quit:** `Cmd+Q` or the app menu. Sets `isQuitting = true` before `app.quit()`
- **`app.on('before-quit')`:** sets `isQuitting = true`
- **`app.on('window-all-closed')`:** no-op (Dock-resident app, never quit on window close)
- **Window dimensions:** 900×650 initial; 700×500 minimum; freely resizable
- **Window position:** persisted in `electron-store` (`config.windowBounds`); restored on next launch
- **Dock icon:** shown while window is visible (`app.dock.show()`); hidden when window hides (`app.dock.hide()`)
- **Dock badge:** `app.dock.setBadge(String(count))` where count = `needs_attention` jobs (empty string when 0); updated on every job status change
- **Activation policy:** default `'regular'` — window appears in Cmd+Tab and Dock when visible. Do **not** call `app.setActivationPolicy('accessory')`. The Dock icon is managed manually via `app.dock.show()` / `app.dock.hide()` (see above).

### First launch detection

On startup, check `electron-store` for `config.workspaceFolder`. If absent (or empty string):
show onboarding overlay in renderer. Do not show main UI or run `restoreJobs()` until
onboarding is complete.

---

## First-Launch Onboarding

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
- Subtext: "Used for naming branches when no other pattern matches (e.g. `sam/feature-name`)"
- Input: plain text field
- Validation (on Get Started click):
  - Non-empty
  - Matches `/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/`
- Error state: inline below input — "Please enter a valid GitHub username"
- **No OAuth button, no "Connect GitHub" placeholder** — plain text field only

### Dismiss behavior

- Closing the onboarding window (Cmd+W, red X, Esc) → `mainWindow.hide()` (hides to Dock)
- On next Dock click → onboarding is shown again (not the main UI)
- There is no way to skip onboarding

### Completion

On "Get Started" (step 2, valid):

1. Save `config.workspaceFolder` and `config.githubHandle` to `electron-store`
2. Run startup checks (`checkOpenCodeBinary()`)
3. Run `workspace:scan`
4. Show main UI (Dashboard tab)

---

## Settings

Accessible from:

- **`Cmd+,`** — standard macOS keyboard shortcut (registered as a global menu accelerator)
- Settings gear icon (⚙) in the app top bar

Both send the `navigate:settings` IPC push from main to renderer.

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
> (swipe, mouse back/forward) is a backlog item — see [Backlog](./backlog.md).

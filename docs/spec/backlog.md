# Future / Backlog

> Not in scope for the current build. Captured here to avoid re-litigating.

- **Notification on completion** — optional macOS notification when a job completes (currently:
  only `needs_attention` fires a notification)
- **Mode Selection** — Allow users to select the starting agent mode (ie build/plan) when creating a new job.
  This would require adding a new field to the workflow YAML schema, updating the UI to allow users to select the mode, and passing this information to the OpenCode orchestrator when creating the job.
- **Per-step workflow config** — allow each workflow step to specify its own model, permission defaults, and other OpenCode settings.
  Currently, all steps inherit the same config from the repo-level `.george-foreman/opencode-config.json`.
  This is a potential future enhancement to allow more granular control over how each step in a workflow is executed and potentially save on costs.
- **Additional Per-repo configs** — Additional pre-repo configs and OpenCode settings.
  Stored as `.george-foreman/opencode-config.json`, which is merged or copied into the worktree at creation time alongside `.env` files.
  Could be shipped with a UI JSON editor in Settings or not.
  - Default model
  - Model selection for the orchestrator (provider + model ID)
  - Default branch
  - Branch prefix overrides
  - Permission defaults (pre-allow `bash` / `edit` / `webfetch` so jobs don't keep prompting)
  - Custom OpenCode rules and tools (e.g. `rules.json`, `tools.json`) for the orchestrator to use
- **Additional themes** — the design token system in `theme.ts` is designed to make
  theme variants straightforward. Potential themes: "Grill/BBQ" (warm amber, charcoal),
  "Futuristic orange" (neon, dark), "Clean steel" (minimal, neutral). Theme switcher in
  Settings.
- **Dock icon flashes on startup and quit** — `app.dock.setIcon()` is called in `app.whenReady()` but macOS briefly shows the default Electron icon before and after the custom icon is applied. Possible approaches: embed the icon directly in the app bundle's `Info.plist` via `electron-builder` `extraInfo` config, or explore whether setting the icon earlier (before `app.whenReady()`) is possible in a future Electron version.
- **Re-run from Archive** — "Re-run" clones the job config and starts a new job, preserving
  the original in archive (currently: archive is read-only history)
- **Workflow argument schema** — structured argument definitions (multiple named params, types,
  validation) declared in the YAML; currently a single free-text `{{argument}}`
- **Job templates** — save a job config (repo + workflow + argument) as a named template for quick reuse.
  Could be stored in the `george-foreman` repo, `.george-foreman/` folders and/or in a global `~/.george-foreman/templates/`
- **OAuth GitHub integration** — replace plain-text GitHub handle with OAuth login; enables PR creation, issue linking, richer branch metadata
- **Concurrent job limit** — currently unlimited; future: user-configurable soft limit in Settings with UI enforcement
- **Token usage tracking** — track and display token consumption per job and over time. OpenCode SSE events include token counts in message metadata;
  accumulate these per job and expose aggregate stats (total tokens, cost estimate, breakdown by job/workflow/repo) in a dedicated panel or Settings page.
  Useful for understanding cost at scale and identifying expensive workflows.
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
  or a Settings link) that surfaces:
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
- **x64 / universal binary support** — the current `.dmg` targets `arm64` (Apple Silicon) only.
  To distribute to Intel Mac users, add `x64` (or `universal`) to the `arch` list in
  `electron-builder.yml` and update the M24 release/packaging step accordingly.
- **macOS code signing + notarization + distribution** — required only if distributing the app
  to other users' Macs. Needs an Apple Developer Program membership ($99/year). The chain:
  Developer ID certificate (`CSC_LINK` + `CSC_KEY_PASSWORD`) → sign the `.app` →
  notarize with Apple (`APPLE_ID` + `APPLE_ID_PASSWORD` + `APPLE_TEAM_ID`) → staple ticket →
  distribute `.dmg`. Add `release.yml` GitHub Actions workflow + `electron-builder` notarize
  config when needed. Not required for personal use — unsigned local builds work fine on your
  own machine.
- **Windows / Linux support** — the app currently targets macOS exclusively. APIs used without
  cross-platform guards: `app.dock`, `app.dock.setBadge()`, macOS notifications, and
  `nativeImage`. Future work: audit all macOS-specific API calls, add platform guards, replace
  or polyfill where needed (e.g. Windows taskbar badge via overlay icon, Linux notifications via
  `libnotify`). Would also require Windows/Linux CI runners and packaging targets in
  `electron-builder` config.

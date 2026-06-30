# George Foreman — Exhaustive Specification

> This spec is the single source of truth for the George Foreman project. It covers every
> facet of the application: architecture, use cases, edge cases, error handling, IPC contract,
> data models, UI layout, design tokens, testing strategy, CI/CD, and implementation milestones.
> All decisions recorded here supersede any prior planning documents.
> The spec is split across multiple files in this directory — this file is the entry point and table of contents.

---

## Table of Contents

- [1. Overview](#overview) _(this file)_
- [2. Environment & Toolchain](./environment.md#environment--toolchain)
- [3. Design System](./ui.md#design-system)
- [4. App Startup & Lifecycle](./app-lifecycle.md#app-startup--lifecycle)
- [5. First-Launch Onboarding](./app-lifecycle.md#first-launch-onboarding)
- [6. Settings](./app-lifecycle.md#settings)
- [7. Workspace Scanning](./workspace-workflows.md#workspace-scanning)
- [8. Workflow System](./workspace-workflows.md#workflow-system)
- [9. Job Creation Flow](./job-creation.md#job-creation-flow)
- [10. Git Worktree Management](./job-creation.md#git-worktree-management)
- [11. OpenCode Process Management](./opencode-integration.md#opencode-process-management)
- [12. OpenCode HTTP API Client](./opencode-integration.md#opencode-http-api-client)
- [13. Job Lifecycle & State Machine](./job-state.md#job-lifecycle--state-machine)
- [14. Real-time Updates (SSE)](./opencode-integration.md#real-time-updates-sse)
- [15. Orchestrator Protocol](./opencode-integration.md#orchestrator-protocol)
- [16. Job State Persistence (electron-store)](./job-state.md#job-state-persistence-electron-store)
- [17. IPC Contract](./ipc.md#ipc-contract)
- [18. UI Structure](./ui.md#ui-structure)
- [19. Notification System](./ui.md#notification-system)
- [20. Error Handling & Failure Modes](./engineering.md#error-handling--failure-modes)
- [21. Build & Packaging](./engineering.md#build--packaging)
- [22. CI Pipeline](./engineering.md#ci-pipeline)
- [23. Known Gotchas](./gotchas.md#known-gotchas)
- [24. Implementation Milestones](./milestones.md#implementation-milestones)
- [25. Future / Backlog](./backlog.md#future--backlog)

---

## Overview

**George Foreman** is a macOS Electron application for managing AI agent workflows.

The user defines multi-step workflows in YAML files. When a "job" is created, the app:

1. Creates a Git worktree for the target repository on a new branch
2. Spawns an `opencode serve` process inside that worktree
3. Sends the workflow + user argument to an OpenCode orchestrator session via HTTP
4. Monitors progress in real time via OpenCode's SSE event stream
5. Notifies the user when a job needs their attention (permission request or question)

The app lives in the macOS Dock. The window hides on close; click the Dock icon to reopen it.

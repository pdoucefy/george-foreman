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
- [3. Repository Structure](./environment.md#repository-structure)
- [4. Design System](./ui.md#design-system)
- [5. App Startup & Lifecycle](./app-lifecycle.md#app-startup--lifecycle)
- [6. First-Launch Onboarding](./app-lifecycle.md#first-launch-onboarding)
- [7. Settings](./app-lifecycle.md#settings)
- [8. Workspace Scanning](./workspace-workflows.md#workspace-scanning)
- [9. Workflow System](./workspace-workflows.md#workflow-system)
- [10. Job Creation Flow](./job-creation.md#job-creation-flow)
- [11. Git Worktree Management](./job-creation.md#git-worktree-management)
- [12. OpenCode Process Management](./opencode-integration.md#opencode-process-management)
- [13. OpenCode HTTP API Client](./opencode-integration.md#opencode-http-api-client)
- [14. Job Lifecycle & State Machine](./job-state.md#job-lifecycle--state-machine)
- [15. Real-time Updates (SSE)](./opencode-integration.md#real-time-updates-sse)
- [16. Orchestrator Protocol](./opencode-integration.md#orchestrator-protocol)
- [17. Job State Persistence (electron-store)](./job-state.md#job-state-persistence-electron-store)
- [18. IPC Contract](./ipc.md#ipc-contract)
- [19. UI Structure](./ui.md#ui-structure)
- [20. Notification System](./ui.md#notification-system)
- [21. Error Handling & Failure Modes](./engineering.md#error-handling--failure-modes)
- [22. Coding Patterns & Conventions](./engineering.md#coding-patterns--conventions)
- [23. Testing Strategy](./engineering.md#testing-strategy)
- [24. Build & Packaging](./engineering.md#build--packaging)
- [25. CI Pipeline](./engineering.md#ci-pipeline)
- [26. Dependencies](./engineering.md#dependencies)
- [27. Known Gotchas](./gotchas.md#known-gotchas)
- [28. Implementation Milestones](./milestones.md#implementation-milestones)
- [29. Future / Backlog](./backlog.md#future--backlog)

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

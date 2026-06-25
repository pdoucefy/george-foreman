# Environment & Toolchain / Repository Structure

## Environment & Toolchain

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

## Repository Structure

```text
george-foreman/
├── .github/
│   └── workflows/
│       └── ci.yml             # Lint + typecheck + test on push/PR
├── docs/
│   └── spec/                  # Spec files (see docs/spec/index.md)
├── resources/                 # Static assets (empty initially; icon files if needed)
├── src/
│   ├── main/
│   │   ├── __tests__/         # Vitest tests — one file per module
│   │   ├── index.ts           # App entry point — thin wiring only
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
│   │       ├── theme.ts       # Design tokens (see ui.md §4)
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
│       └── types/             # Shared domain types + IPC contract (barrel: types/index.ts)
│           ├── index.ts       # Re-exports all modules below
│           ├── ipc.ts         # ElectronAPI (window.api shape) + SessionMessage + MessagePart
│           ├── job.ts         # Job, JobStatus, TaskState, PendingPermission, JobCreateParams
│           ├── repo.ts        # Repo schema
│           ├── sse.ts         # GlobalEvent, Permission, OrchestratorEvent, SSE event types
│           ├── store.ts       # StoreSchema, Config, WindowBounds schemas
│           └── workflow.ts    # Workflow, WorkflowTask, WorkflowSource, WorkflowArgument
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
└── README.md
```

> **Note on `.george-foreman/`:** This is a per-repo config directory that lives inside each
> user's own repositories (not in the george-foreman app repo itself). See [§9](./workspace-workflows.md#workflow-system) for its format.

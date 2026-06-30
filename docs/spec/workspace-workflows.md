# Workspace Scanning / Workflow System

## Workspace Scanning

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

See `src/shared/types/repo.ts`.

### Edge cases

| Scenario                                           | Behavior                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Workspace folder doesn't exist                     | Empty repo list; inline error in Settings: "Folder not found. Update path in Settings." |
| Workspace folder is empty                          | Empty repo list; Dashboard shows "No repos" empty state                                 |
| Repo has no remote                                 | Default branch detection falls back to `main`                                           |
| Symlinked directory                                | Included (resolved to real path for git commands)                                       |
| Directory named `.george-foreman` inside workspace | Scanned normally — if it contains `.git` it's a valid repo                              |

---

## Workflow System

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

A JSON Schema (Draft 7) file is shipped at `workflows/workflow-schema.json`. It enables VS Code
and any editor with YAML Schema support to validate workflow files with inline errors and
autocompletion. The built-in `workflows/example.yml` includes the `$schema` comment as a
living example. Read `workflows/workflow-schema.json` directly for the current schema.

### Three workflow sources

Loaded and merged in this priority order (all three always shown in picker):

1. **Repo-level** — `.george-foreman/workflows/*.yml` and `*.yaml` inside the selected repo
   - Labeled with the repo name (e.g. "my-app")
   - Shown first in picker
2. **User folder** — path configured in Settings → User workflows folder (`*.yml` and `*.yaml`)
   - Labeled with the folder's basename
   - Shown second
3. **Built-in** — `workflows/*.yml` and `*.yaml` shipped inside the app bundle
   - Labeled "Built-in"
   - Shown last

No deduplication — workflows with the same `name` from different sources all appear, each with
their source label.

### `workflow-loader.ts`

Responsibilities:

1. Given a `repoPath` and the current `Config`, locate files from all three sources (`.yml` and `.yaml` extensions accepted)
2. Parse each YAML file with `js-yaml`
3. Validate required fields; skip malformed files with a `console.warn` (do not crash)
4. Return `Workflow[]`

See `src/shared/types/workflow.ts` for the `Workflow`, `WorkflowTask`, `WorkflowSource`, and `WorkflowArgument` Zod schemas.

### `.george-foreman/` per-repo config directory

Lives inside each user's repo (not the george-foreman app repo). Git-ignored or committed —
user's choice.

```text
<repo>/.george-foreman/
├── workflows/          # Repo-specific workflow YAMLs (*.yml and *.yaml accepted)
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

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
> **M2** (making the repo public + CI pipeline). During development (before the repo
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

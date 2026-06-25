# Job Creation Flow / Git Worktree Management

## Job Creation Flow

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
| None of the above                               | `<github-handle>/<workflow-slug>` (e.g. `sam/Implement-Feature`)                      |

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
4. Create Git worktree ([§11](#git-worktree-management))
5. Copy gitignored files ([§11](#git-worktree-management))
6. Spawn `opencode serve` ([§12](./opencode-integration.md#opencode-process-management))
7. Poll `/global/health` until ready ([§12](./opencode-integration.md#opencode-process-management))
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

## Git Worktree Management

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

1. Determine globs (see [§9 file-copy fallback chain](./workspace-workflows.md#file-copy-fallback-chain))
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

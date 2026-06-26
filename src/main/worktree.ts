import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Git worktree management: create, delete, path generation, branch slug utilities.

// ---------------------------------------------------------------------------
// Internal git helper (same pattern as workspace.ts)
// ---------------------------------------------------------------------------

const runGit = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', args, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });

// ---------------------------------------------------------------------------
// Pure: slugify
// ---------------------------------------------------------------------------

/**
 * Convert a string to a branch slug component.
 * Rules (per spec):
 *   - Replace spaces and underscores with `-`
 *   - Remove characters that are not alphanumeric or `-`
 *   - Collapse consecutive `-` into one
 *   - Trim leading/trailing `-`
 *   - Do NOT lowercase — casing is preserved
 */
export const slugify = (text: string): string =>
  text
    .replace(/[ _]/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------------------
// Pure: getWorktreePath
// ---------------------------------------------------------------------------

/**
 * Compute the worktree directory path for a job.
 * Pattern: <workspaceFolder>/<repoName>--<branchSlug>
 * where <branchSlug> is the full branch name with `/` replaced by `--`.
 */
export const getWorktreePath = (
  workspaceFolder: string,
  repoName: string,
  branchName: string,
): string => {
  const branchSlug = branchName.replace(/\//g, '--');
  return join(workspaceFolder, `${repoName}--${branchSlug}`);
};

// ---------------------------------------------------------------------------
// Pure: previewBranchName
// ---------------------------------------------------------------------------

const AV_PATTERN = /^AV-\d+$/i;

const KEYWORD_PREFIXES: Array<{ pattern: RegExp; prefix: string }> = [
  { pattern: /bugfix/i, prefix: 'bugfix' },
  { pattern: /refactor/i, prefix: 'refactor' },
  { pattern: /devx|dev-x|devexp|dev-exp|developer-experience/i, prefix: 'devX' },
  { pattern: /hotfix/i, prefix: 'hotfix' },
  { pattern: /chore/i, prefix: 'chore' },
  { pattern: /docs/i, prefix: 'docs' },
];

/**
 * Generate a branch name preview from argument + workflow name + github handle.
 * Implements the full prefix-selection table from the spec (first match wins).
 */
export const previewBranchName = (params: {
  argument: string;
  workflowName: string;
  githubHandle: string;
}): string => {
  const { argument, workflowName, githubHandle } = params;
  const localSlug = slugify(argument);
  const workflowSlug = slugify(workflowName);

  // When argument is empty (workflow.argument === 'none'), use workflow-slug only
  if (localSlug === '') {
    // AV pattern is not applicable when argument is empty — fall through
    const keywordMatch = KEYWORD_PREFIXES.find(({ pattern }) => pattern.test(workflowName));
    if (keywordMatch) return `${keywordMatch.prefix}/${workflowSlug}`;
    return `${githubHandle}/${workflowSlug}`;
  }

  // AV-\d+ argument → <local-slug>/<workflow-slug>
  if (AV_PATTERN.test(argument)) return `${localSlug}/${workflowSlug}`;

  // Workflow keyword match → <prefix>/<local-slug>
  const keywordMatch = KEYWORD_PREFIXES.find(({ pattern }) => pattern.test(workflowName));
  if (keywordMatch) return `${keywordMatch.prefix}/${localSlug}`;

  // Default → <github-handle>/<local-slug>
  return `${githubHandle}/${localSlug}`;
};

// ---------------------------------------------------------------------------
// Internal: copy gitignored files
// (declared before createWorktree to avoid @typescript-eslint/no-use-before-define)
// ---------------------------------------------------------------------------

const HARDCODED_DEFAULT_GLOBS = ['.env', '.env.*', '.env.local'];

type GlobFn = (pattern: string, options: { cwd: string }) => AsyncIterable<string>;

const copyOneFile = async (params: {
  relativePath: string;
  repoPath: string;
  worktreePath: string;
}): Promise<void> => {
  const { relativePath, repoPath, worktreePath } = params;
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(join(repoPath, relativePath));
  } catch {
    return; // stat failed — skip
  }
  if (!stat.isFile()) return; // directory — skip

  const dest = join(worktreePath, relativePath);
  try {
    await fs.mkdir(dirname(dest), { recursive: true });
    await fs.copyFile(join(repoPath, relativePath), dest);
  } catch (copyErr) {
    console.warn(`[worktree] failed to copy "${relativePath}":`, copyErr);
  }
};

const copyIgnoredFiles = async (params: {
  repoPath: string;
  worktreePath: string;
  defaultCopyGlobs: string;
}): Promise<void> => {
  const { repoPath, worktreePath, defaultCopyGlobs } = params;

  // Determine globs via fallback chain
  const copyFilesPath = join(repoPath, '.george-foreman', 'copy-files');
  let globs: string[];

  try {
    const raw = await fs.readFile(copyFilesPath, 'utf8');
    globs = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  } catch {
    // No copy-files file — try defaultCopyGlobs
    const parsed = defaultCopyGlobs
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    globs = parsed.length > 0 ? parsed : HARDCODED_DEFAULT_GLOBS;
  }

  if (globs.length === 0) return;

  // Expand globs against repoPath (Node 22 built-in fs.promises.glob)
  const globFn = (fs as unknown as { glob: GlobFn }).glob;

  const collectPaths = async (pattern: string): Promise<string[]> => {
    const paths: string[] = [];
    try {
      for await (const relativePath of globFn(pattern, { cwd: repoPath })) {
        paths.push(relativePath);
      }
    } catch (globErr) {
      console.warn(`[worktree] failed to expand glob "${pattern}":`, globErr);
    }
    return paths;
  };

  const allPaths = (await Promise.all(globs.map(collectPaths))).flat();

  await Promise.all(
    allPaths.map((relativePath) => copyOneFile({ relativePath, repoPath, worktreePath })),
  );
};

// ---------------------------------------------------------------------------
// Async: createWorktree
// ---------------------------------------------------------------------------

export type CreateWorktreeParams = {
  repoPath: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  defaultCopyGlobs: string; // newline-separated; used as fallback
};

/**
 * Create a git worktree:
 *   1. git worktree prune (unconditionally)
 *   2. Check <worktreePath> does not exist
 *   3. Check <branchName> does not already exist in the repo
 *   4. git worktree add <worktreePath> -b <branchName> <baseBranch>
 *   5. Copy gitignored files from <repoPath> to <worktreePath>
 */
export const createWorktree = async (params: CreateWorktreeParams): Promise<void> => {
  const { repoPath, worktreePath, branchName, baseBranch, defaultCopyGlobs } = params;

  // Step 1: prune stale worktree entries
  await runGit(['-C', repoPath, 'worktree', 'prune']);

  // Step 2: check worktree directory does not exist
  try {
    await fs.access(worktreePath);
    // If access succeeds, directory exists — fail
    throw new Error(`Worktree directory already exists: ${worktreePath}. Remove it and try again.`);
  } catch (err) {
    // access threw ENOENT → directory does not exist → good
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // Step 3: check branch does not already exist
  try {
    await runGit(['-C', repoPath, 'show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
    // If show-ref succeeds, branch exists
    throw new Error(`Branch already exists in this repo. Choose a different name.`);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg === 'Branch already exists in this repo. Choose a different name.') throw err;
    // Any other error means the ref does not exist → good
  }

  // Step 4: create the worktree
  await runGit(['-C', repoPath, 'worktree', 'add', worktreePath, '-b', branchName, baseBranch]);

  // Step 5: copy gitignored files
  await copyIgnoredFiles({ repoPath, worktreePath, defaultCopyGlobs });
};

// ---------------------------------------------------------------------------
// Async: deleteWorktree
// ---------------------------------------------------------------------------

export type DeleteWorktreeParams = {
  repoPath: string;
  worktreePath: string;
};

export type DeleteWorktreeResult =
  | { success: true }
  | { success: false; hasUncommittedChanges: true; error: string }
  | { success: false; hasUncommittedChanges?: false; error: string };

/**
 * Attempt a non-forced worktree removal.
 * Returns { success: true } on clean removal.
 * Returns { success: false, hasUncommittedChanges: true } when git detects dirty state.
 * Returns { success: false, error } for other failures (also runs git worktree prune as recovery).
 */
export const deleteWorktree = async (
  params: DeleteWorktreeParams,
): Promise<DeleteWorktreeResult> => {
  const { repoPath, worktreePath } = params;
  try {
    await runGit(['-C', repoPath, 'worktree', 'remove', worktreePath]);
    return { success: true };
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (/modified|untracked/i.test(message)) {
      return { success: false, hasUncommittedChanges: true, error: message };
    }
    // Recovery: prune stale entries
    try {
      await runGit(['-C', repoPath, 'worktree', 'prune']);
    } catch {
      // best-effort
    }
    return { success: false, error: message };
  }
};

// ---------------------------------------------------------------------------
// Async: deleteWorktreeForce
// ---------------------------------------------------------------------------

export type DeleteWorktreeForceResult = { success: true } | { success: false; error: string };

/**
 * Force-remove a worktree, discarding uncommitted changes.
 */
export const deleteWorktreeForce = async (
  params: DeleteWorktreeParams,
): Promise<DeleteWorktreeForceResult> => {
  const { repoPath, worktreePath } = params;
  try {
    await runGit(['-C', repoPath, 'worktree', 'remove', '--force', worktreePath]);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message ?? 'Unknown error' };
  }
};

// ---------------------------------------------------------------------------
// Async: listBranches
// ---------------------------------------------------------------------------

/**
 * List all branches (local + remote) for a repo, with origin/ prefix stripped
 * from remote-tracking branches. Deduplicates and sorts alphabetically.
 */
export const listBranches = async (repoPath: string): Promise<string[]> => {
  let output: string;
  try {
    output = await runGit(['-C', repoPath, 'branch', '-a', '--format=%(refname:short)']);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const branches: string[] = [];

  for (const line of output.split('\n').filter((l) => l.trim() !== '')) {
    const raw = line.trim();
    const name = raw.startsWith('origin/') ? raw.slice('origin/'.length) : raw;
    if (!seen.has(name)) {
      seen.add(name);
      branches.push(name);
    }
  }

  return branches.sort((a, b) => a.localeCompare(b));
};

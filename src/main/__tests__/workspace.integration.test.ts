import { execFile as execFileCb } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanWorkspace } from '../workspace.ts';

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const git = (cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> =>
  execFile('git', args, { cwd });

const makeGitRepo = async (dir: string, branch = 'main'): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
  await git(dir, 'init', '-q', '-b', branch);
  await git(dir, 'config', 'user.email', 'test@example.com');
  await git(dir, 'config', 'user.name', 'Test');
  await git(dir, 'commit', '--allow-empty', '-m', 'init', '-q');
};

const makeWorktree = async (mainRepoDir: string, worktreePath: string): Promise<void> => {
  await git(mainRepoDir, 'worktree', 'add', '--orphan', '-b', 'wt-branch', worktreePath);
};

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gf-integration-'));
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scanWorkspace (integration)', () => {
  it('includes a plain directory that has a .git directory', async () => {
    await fs.mkdir(path.join(workspace, 'my-repo', '.git'), { recursive: true });

    const result = await scanWorkspace(workspace);

    expect(result.map((r) => r.name)).toContain('my-repo');
  });

  it('excludes a git worktree directory (whose .git is a file, not a directory)', async () => {
    // Create a real main repo + worktree so .git is a real file
    const mainRepo = path.join(workspace, '_main-repo');
    const worktreePath = path.join(workspace, 'my-worktree');
    await makeGitRepo(mainRepo);
    await makeWorktree(mainRepo, worktreePath);

    const result = await scanWorkspace(workspace);

    // worktree is excluded; main repo is also excluded (starts with _ by convention here,
    // but actually both are in workspace — assert worktree is NOT present)
    expect(result.map((r) => r.name)).not.toContain('my-worktree');
  });

  it('excludes a directory with no .git entry', async () => {
    await fs.mkdir(path.join(workspace, 'not-a-repo'));

    const result = await scanWorkspace(workspace);

    expect(result.map((r) => r.name)).not.toContain('not-a-repo');
  });

  it('excludes plain file entries', async () => {
    await fs.writeFile(path.join(workspace, 'README.md'), '# hello');

    const result = await scanWorkspace(workspace);

    expect(result.map((r) => r.name)).not.toContain('README.md');
  });

  it('includes a symlinked repo, using symlink name as Repo.name and real path as Repo.path', async () => {
    // Real repo lives outside the workspace
    const realRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'gf-real-repo-'));
    try {
      await makeGitRepo(realRepo);
      const symlinkPath = path.join(workspace, 'linked-repo');
      await fs.symlink(realRepo, symlinkPath);

      const result = await scanWorkspace(workspace);

      const repo = result.find((r) => r.name === 'linked-repo');
      expect(repo).toBeDefined();
      expect(repo?.name).toBe('linked-repo');
      // path should be the resolved real path, not the symlink path
      const resolved = await fs.realpath(realRepo);
      expect(repo?.path).toBe(resolved);
    } finally {
      await fs.rm(realRepo, { recursive: true, force: true });
    }
  });

  it('returns empty array when workspace folder does not exist', async () => {
    const result = await scanWorkspace('/no/such/folder/gf-test-xyz');

    expect(result).toEqual([]);
  });

  it('returns empty array when workspace folder is empty', async () => {
    const result = await scanWorkspace(workspace);

    expect(result).toEqual([]);
  });

  it('detects default branch from symbolic-ref (origin/HEAD)', async () => {
    const repoDir = path.join(workspace, 'repo');
    await fs.mkdir(repoDir);
    await git(repoDir, 'init', '-q');
    // Set origin/HEAD without a real remote fetch
    await git(repoDir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');

    const result = await scanWorkspace(workspace);

    expect(result[0]?.defaultBranch).toBe('main');
  });

  it('falls back to "main" when symbolic-ref fails but refs/heads/main exists', async () => {
    const repoDir = path.join(workspace, 'repo');
    await makeGitRepo(repoDir, 'main'); // creates a commit on main, no remote

    const result = await scanWorkspace(workspace);

    expect(result[0]?.defaultBranch).toBe('main');
  });

  it('falls back to "master" when symbolic-ref fails and only refs/heads/master exists', async () => {
    const repoDir = path.join(workspace, 'repo');
    await makeGitRepo(repoDir, 'master'); // creates a commit on master, no remote

    const result = await scanWorkspace(workspace);

    expect(result[0]?.defaultBranch).toBe('master');
  });

  it('falls back to "main" when no commits and no remote exist', async () => {
    // git init only — no commits, no remote, no refs at all
    const repoDir = path.join(workspace, 'repo');
    await fs.mkdir(repoDir);
    await git(repoDir, 'init', '-q');

    const result = await scanWorkspace(workspace);

    expect(result[0]?.defaultBranch).toBe('main');
  });

  it('returns multiple repos sorted alphabetically by name', async () => {
    await Promise.all(
      ['zebra', 'alpha', 'middle'].map((name) => makeGitRepo(path.join(workspace, name))),
    );

    const result = await scanWorkspace(workspace);

    expect(result.map((r) => r.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('treats .george-foreman directory as a valid repo if it has a .git directory', async () => {
    await makeGitRepo(path.join(workspace, '.george-foreman'));

    const result = await scanWorkspace(workspace);

    expect(result.map((r) => r.name)).toContain('.george-foreman');
  });
});

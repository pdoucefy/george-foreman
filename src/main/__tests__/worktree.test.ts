import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createWorktree,
  deleteWorktree,
  deleteWorktreeForce,
  getWorktreePath,
  listBranches,
  previewBranchName,
  slugify,
} from '../worktree.ts';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn(),
  glob: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);
const mockAccess = vi.mocked(fs.access);
const mockReadFile = vi.mocked(fs.readFile);
const mockStat = vi.mocked(fs.stat);
const mockMkdir = vi.mocked(fs.mkdir);
const mockCopyFile = vi.mocked(fs.copyFile);
const mockGlob = vi.mocked(
  (fs as unknown as { glob: (...args: unknown[]) => AsyncIterable<string> }).glob,
);

// Helper: mock execFile to respond in sequence
const mockExecFileWith = (responses: Array<{ stdout?: string; error?: Error }>): void => {
  let call = 0;
  mockExecFile.mockImplementation((_cmd, _args, callback: unknown) => {
    const r = responses[call++] ?? { error: new Error('unexpected extra execFile call') };
    if (r.error) {
      (callback as (err: Error) => void)(r.error);
    } else {
      (callback as (err: null, stdout: string) => void)(null, r.stdout ?? '');
    }
    return {} as ReturnType<typeof execFile>;
  });
};

// Helper: make an async iterable from an array
const makeAsyncIterable = (items: string[]): AsyncIterable<string> => ({
  async *[Symbol.asyncIterator]() {
    for (const item of items) yield item;
  },
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// slugify
// ===========================================================================

describe('slugify', () => {
  it('replaces spaces with hyphens', () => {
    expect(slugify('the auth module')).toBe('the-auth-module');
  });

  it('replaces underscores with hyphens', () => {
    expect(slugify('my_feature')).toBe('my-feature');
  });

  it('removes non-alphanumeric non-hyphen characters', () => {
    expect(slugify('Fix: weird bug!!')).toBe('Fix-weird-bug');
  });

  it('collapses consecutive hyphens and trims leading/trailing hyphens', () => {
    expect(slugify('_ spaces  -')).toBe('spaces');
  });

  it('preserves casing', () => {
    expect(slugify('AV-123')).toBe('AV-123');
  });

  it('returns empty string when all characters are removed', () => {
    expect(slugify('!!!@@@###')).toBe('');
  });
});

// ===========================================================================
// getWorktreePath
// ===========================================================================

describe('getWorktreePath', () => {
  it('joins workspace, repoName, and branchSlug with -- separator', () => {
    expect(getWorktreePath('/workspace', 'my-app', 'av-123/Implement-Feature')).toBe(
      '/workspace/my-app--av-123--Implement-Feature',
    );
  });

  it('replaces all slashes in branch name with --', () => {
    expect(getWorktreePath('/workspace', 'my-app', 'pdoucet/fix-weird-bug')).toBe(
      '/workspace/my-app--pdoucet--fix-weird-bug',
    );
  });
});

// ===========================================================================
// previewBranchName
// ===========================================================================

describe('previewBranchName', () => {
  // -------------------------------------------------------------------------
  // AV pattern (argument present)
  // -------------------------------------------------------------------------

  it('AV-\\d+ argument → <local-slug>/<workflow-slug>', () => {
    expect(
      previewBranchName({
        argument: 'AV-123',
        workflowName: 'Implement Feature',
        githubHandle: 'george',
      }),
    ).toBe('AV-123/Implement-Feature');
  });

  it('AV pattern is case-insensitive', () => {
    expect(
      previewBranchName({ argument: 'av-456', workflowName: 'Fix Bug', githubHandle: 'george' }),
    ).toBe('av-456/Fix-Bug');
  });

  // -------------------------------------------------------------------------
  // Keyword prefixes (argument present)
  // -------------------------------------------------------------------------

  it('workflow name contains "bugfix" → bugfix/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'the auth module',
        workflowName: 'Bugfix Workflow',
        githubHandle: 'george',
      }),
    ).toBe('bugfix/the-auth-module');
  });

  it('workflow name contains "refactor" → refactor/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'auth',
        workflowName: 'Refactor Module',
        githubHandle: 'george',
      }),
    ).toBe('refactor/auth');
  });

  it('workflow name contains "devx" → devX/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'ci',
        workflowName: 'DevX Improvements',
        githubHandle: 'george',
      }),
    ).toBe('devX/ci');
  });

  it('workflow name contains "dev-exp" → devX/<local-slug>', () => {
    expect(
      previewBranchName({ argument: 'ci', workflowName: 'Dev-Exp Task', githubHandle: 'george' }),
    ).toBe('devX/ci');
  });

  it('workflow name contains "developer-experience" → devX/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'ci',
        workflowName: 'Developer-Experience Epic',
        githubHandle: 'george',
      }),
    ).toBe('devX/ci');
  });

  it('workflow name contains "hotfix" → hotfix/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'crash',
        workflowName: 'Hotfix Deploy',
        githubHandle: 'george',
      }),
    ).toBe('hotfix/crash');
  });

  it('workflow name contains "chore" → chore/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'deps',
        workflowName: 'Chore: Update Deps',
        githubHandle: 'george',
      }),
    ).toBe('chore/deps');
  });

  it('workflow name contains "docs" → docs/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'readme',
        workflowName: 'Docs Update',
        githubHandle: 'george',
      }),
    ).toBe('docs/readme');
  });

  it('keyword match is case-insensitive', () => {
    expect(
      previewBranchName({ argument: 'auth', workflowName: 'BUGFIX fast', githubHandle: 'george' }),
    ).toBe('bugfix/auth');
  });

  // -------------------------------------------------------------------------
  // Default (argument present)
  // -------------------------------------------------------------------------

  it('no AV pattern, no keyword → <githubHandle>/<local-slug>', () => {
    expect(
      previewBranchName({
        argument: 'my feature',
        workflowName: 'Implement Milestone',
        githubHandle: 'pdoucet',
      }),
    ).toBe('pdoucet/my-feature');
  });

  // -------------------------------------------------------------------------
  // Empty argument (workflow.argument === 'none')
  // -------------------------------------------------------------------------

  it('empty argument + keyword match → <prefix>/<workflow-slug> (no local-slug)', () => {
    expect(
      previewBranchName({ argument: '', workflowName: 'Bugfix Workflow', githubHandle: 'george' }),
    ).toBe('bugfix/Bugfix-Workflow');
  });

  it('empty argument + no keyword → <githubHandle>/<workflow-slug>', () => {
    expect(
      previewBranchName({
        argument: '',
        workflowName: 'Implement Feature',
        githubHandle: 'pdoucet',
      }),
    ).toBe('pdoucet/Implement-Feature');
  });

  it('empty argument + AV not applicable → falls through to <githubHandle>/<workflow-slug>', () => {
    // argument is empty, AV pattern cannot match
    expect(
      previewBranchName({ argument: '', workflowName: 'Deploy', githubHandle: 'george' }),
    ).toBe('george/Deploy');
  });
});

// ===========================================================================
// createWorktree
// ===========================================================================

describe('createWorktree', () => {
  const BASE_PARAMS = {
    repoPath: '/repos/my-app',
    worktreePath: '/workspace/my-app--AV-123--Implement-Feature',
    branchName: 'AV-123/Implement-Feature',
    baseBranch: 'main',
    defaultCopyGlobs: '.env\n.env.*',
  };

  beforeEach(() => {
    // Default: worktree path does not exist, branch does not exist, all git commands succeed
    mockAccess.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockExecFileWith([
      { stdout: '' }, // git worktree prune
      { error: Object.assign(new Error('not found'), { code: 128 }) }, // show-ref (branch absent)
      { stdout: '' }, // git worktree add
    ]);
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockGlob.mockReturnValue(makeAsyncIterable([]));
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
  });

  it('calls git worktree prune before git worktree add', async () => {
    await createWorktree(BASE_PARAMS);

    const { calls } = mockExecFile.mock;
    const pruneCall = calls.find((c) => (c[1] as string[]).includes('prune'));
    const addCall = calls.find((c) => (c[1] as string[]).includes('add'));
    expect(pruneCall).toBeDefined();
    expect(addCall).toBeDefined();
    // prune must come before add
    expect(calls.indexOf(pruneCall!)).toBeLessThan(calls.indexOf(addCall!));
  });

  it('throws if worktree directory already exists after prune', async () => {
    mockAccess.mockResolvedValue(undefined); // directory exists

    await expect(createWorktree(BASE_PARAMS)).rejects.toThrow('already exists');
  });

  it('throws "Branch already exists" when show-ref --verify succeeds', async () => {
    mockExecFileWith([
      { stdout: '' }, // prune
      { stdout: '' }, // show-ref succeeds → branch exists
    ]);

    await expect(createWorktree(BASE_PARAMS)).rejects.toThrow('Branch already exists');
  });

  it('runs git worktree add with correct arguments', async () => {
    await createWorktree(BASE_PARAMS);

    const addCall = mockExecFile.mock.calls.find((c) => (c[1] as string[]).includes('add'));
    expect(addCall?.[1]).toEqual([
      '-C',
      '/repos/my-app',
      'worktree',
      'add',
      '/workspace/my-app--AV-123--Implement-Feature',
      '-b',
      'AV-123/Implement-Feature',
      'main',
    ]);
  });

  it('reads globs from .george-foreman/copy-files when it exists', async () => {
    mockReadFile.mockResolvedValue('.env\n.secrets\n');
    mockGlob.mockReturnValue(makeAsyncIterable(['.env']));
    mockStat.mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);

    await createWorktree(BASE_PARAMS);

    expect(mockReadFile).toHaveBeenCalledWith('/repos/my-app/.george-foreman/copy-files', 'utf8');
  });

  it('falls back to defaultCopyGlobs when no copy-files file', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockGlob.mockReturnValue(makeAsyncIterable(['.env']));
    mockStat.mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);

    await createWorktree({ ...BASE_PARAMS, defaultCopyGlobs: '.env\n.env.*' });

    // glob called with patterns from defaultCopyGlobs
    expect(mockGlob).toHaveBeenCalledWith(
      '.env',
      expect.objectContaining({ cwd: '/repos/my-app' }),
    );
  });

  it('falls back to hardcoded defaults when defaultCopyGlobs is empty', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockGlob.mockReturnValue(makeAsyncIterable([]));

    await createWorktree({ ...BASE_PARAMS, defaultCopyGlobs: '' });

    // glob called with hardcoded .env
    expect(mockGlob).toHaveBeenCalledWith('.env', expect.anything());
  });

  it('copies each matched file to <worktreePath>/<relativePath>', async () => {
    mockReadFile.mockResolvedValue('.env\n');
    mockGlob.mockReturnValue(makeAsyncIterable(['.env']));
    mockStat.mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);

    await createWorktree(BASE_PARAMS);

    expect(mockMkdir).toHaveBeenCalledWith('/workspace/my-app--AV-123--Implement-Feature', {
      recursive: true,
    });
    expect(mockCopyFile).toHaveBeenCalledWith(
      '/repos/my-app/.env',
      '/workspace/my-app--AV-123--Implement-Feature/.env',
    );
  });

  it('individual copy failure logs a warning but does not throw', async () => {
    mockReadFile.mockResolvedValue('.env\n');
    mockGlob.mockReturnValue(makeAsyncIterable(['.env']));
    mockStat.mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockRejectedValue(new Error('disk full'));

    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined);
    await expect(createWorktree(BASE_PARAMS)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ===========================================================================
// deleteWorktree
// ===========================================================================

describe('deleteWorktree', () => {
  const PARAMS = { repoPath: '/repos/my-app', worktreePath: '/workspace/my-app--main' };

  it('returns { success: true } on clean removal', async () => {
    mockExecFileWith([{ stdout: '' }]);

    const result = await deleteWorktree(PARAMS);
    expect(result).toEqual({ success: true });
  });

  it('returns { success: false, hasUncommittedChanges: true } when git reports modified files', async () => {
    mockExecFileWith([
      { error: new Error('contains modified or untracked files') },
      { stdout: '' }, // prune recovery — should NOT be called for uncommitted changes
    ]);

    const result = await deleteWorktree(PARAMS);
    expect(result).toEqual({
      success: false,
      hasUncommittedChanges: true,
      error: 'contains modified or untracked files',
    });
  });

  it('returns { success: false, error } for other git errors and runs git worktree prune as recovery', async () => {
    mockExecFileWith([
      { error: new Error('permission denied') },
      { stdout: '' }, // prune recovery
    ]);

    const result = await deleteWorktree(PARAMS);
    expect(result).toMatchObject({ success: false, error: 'permission denied' });

    const { calls } = mockExecFile.mock;
    const pruneCall = calls.find((c) => (c[1] as string[]).includes('prune'));
    expect(pruneCall).toBeDefined();
  });

  it('does NOT run git worktree prune for uncommitted-changes errors', async () => {
    mockExecFileWith([{ error: new Error('contains modified or untracked files') }]);

    await deleteWorktree(PARAMS);

    const { calls } = mockExecFile.mock;
    expect(calls).toHaveLength(1); // only the remove call, no prune
  });
});

// ===========================================================================
// deleteWorktreeForce
// ===========================================================================

describe('deleteWorktreeForce', () => {
  const PARAMS = { repoPath: '/repos/my-app', worktreePath: '/workspace/my-app--main' };

  it('returns { success: true } on successful force-remove', async () => {
    mockExecFileWith([{ stdout: '' }]);

    const result = await deleteWorktreeForce(PARAMS);
    expect(result).toEqual({ success: true });
  });

  it('returns { success: false, error } on failure', async () => {
    mockExecFileWith([{ error: new Error('permission denied') }]);

    const result = await deleteWorktreeForce(PARAMS);
    expect(result).toEqual({ success: false, error: 'permission denied' });
  });

  it('passes --force flag to git worktree remove', async () => {
    mockExecFileWith([{ stdout: '' }]);
    await deleteWorktreeForce(PARAMS);

    const args = mockExecFile.mock.calls[0]?.[1] as string[];
    expect(args).toContain('--force');
  });
});

// ===========================================================================
// listBranches
// ===========================================================================

describe('listBranches', () => {
  it('returns sorted branch names with origin/ prefix stripped', async () => {
    mockExecFileWith([{ stdout: 'main\norigin/main\nfeature-a\norigin/feature-b\n' }]);

    const result = await listBranches('/repos/my-app');
    expect(result).toEqual(['feature-a', 'feature-b', 'main']);
  });

  it('deduplicates local and remote tracking branches with the same name', async () => {
    mockExecFileWith([{ stdout: 'main\norigin/main\n' }]);

    const result = await listBranches('/repos/my-app');
    expect(result).toEqual(['main']);
  });

  it('returns empty array when git command fails', async () => {
    mockExecFileWith([{ error: new Error('not a git repo') }]);

    const result = await listBranches('/not/a/repo');
    expect(result).toEqual([]);
  });
});

import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { scanWorkspace } from '../workspace.ts';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const mockReaddir = vi.mocked(fs.readdir);
const mockStat = vi.mocked(fs.stat);
const mockRealpath = vi.mocked(fs.realpath);
const mockExecFile = vi.mocked(execFile);

// Helper: build a fake Dirent-like object
const makeDirent = (name: string, opts: { isDir?: boolean; isSymlink?: boolean } = {}) =>
  ({
    name,
    isDirectory: () => opts.isDir ?? false,
    isSymbolicLink: () => opts.isSymlink ?? false,
  }) as unknown as Awaited<ReturnType<typeof fs.readdir>>[number];

// Helper: mock execFile to call back with stdout or error, in sequence
const mockExecFileWith = (responses: Array<{ stdout?: string; error?: Error }>): void => {
  let call = 0;
  mockExecFile.mockImplementation((_cmd, _args, callback: unknown) => {
    const r = responses[call++] ?? { error: new Error('unexpected extra call') };
    if (r.error) {
      (callback as (err: Error) => void)(r.error);
    } else {
      (callback as (err: null, stdout: string) => void)(null, r.stdout ?? '');
    }
    return {} as ReturnType<typeof execFile>;
  });
};

// Fake stat result for a directory
const dirStat = { isDirectory: () => true } as Awaited<ReturnType<typeof fs.stat>>;
// Fake stat result for a file (e.g. a worktree .git file)
const fileStat = { isDirectory: () => false } as Awaited<ReturnType<typeof fs.stat>>;

const WORKSPACE = '/workspace';
const REPO_PATH = `${WORKSPACE}/my-repo`;
const REAL_PATH = REPO_PATH; // default: realpath returns same path

describe('scanWorkspace', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Folder-level failures
  // -------------------------------------------------------------------------

  it('returns empty array when workspace folder does not exist', async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await scanWorkspace('/no/such/folder');

    expect(result).toEqual([]);
  });

  it('returns empty array when workspace folder is empty', async () => {
    mockReaddir.mockResolvedValue([]);

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Entry filtering
  // -------------------------------------------------------------------------

  it('includes a plain directory that has a .git directory', async () => {
    mockReaddir.mockResolvedValue([makeDirent('my-repo', { isDir: true })]);
    mockRealpath.mockResolvedValue(REAL_PATH);
    mockStat.mockResolvedValue(dirStat); // .git is a directory
    mockExecFileWith([{ stdout: 'origin/main\n' }]);

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([{ name: 'my-repo', path: REAL_PATH, defaultBranch: 'main' }]);
  });

  it('skips a directory whose .git is a file (worktree)', async () => {
    mockReaddir.mockResolvedValue([makeDirent('my-worktree', { isDir: true })]);
    mockRealpath.mockResolvedValue(`${WORKSPACE}/my-worktree`);
    mockStat.mockResolvedValue(fileStat); // .git is a file

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([]);
  });

  it('skips a directory with no .git entry', async () => {
    mockReaddir.mockResolvedValue([makeDirent('not-a-repo', { isDir: true })]);
    mockRealpath.mockResolvedValue(`${WORKSPACE}/not-a-repo`);
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([]);
  });

  it('skips a plain file entry (not a directory or symlink)', async () => {
    mockReaddir.mockResolvedValue([makeDirent('README.md')]);

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([]);
    expect(mockStat).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Symlink support
  // -------------------------------------------------------------------------

  it('includes a symlinked directory with a .git directory, using resolved real path', async () => {
    const symlinkName = 'link-to-repo';
    const resolvedPath = '/actual/location/my-repo';

    mockReaddir.mockResolvedValue([makeDirent(symlinkName, { isSymlink: true })]);
    mockRealpath.mockResolvedValue(resolvedPath);
    mockStat.mockResolvedValue(dirStat);
    mockExecFileWith([{ stdout: 'origin/main\n' }]);

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([{ name: symlinkName, path: resolvedPath, defaultBranch: 'main' }]);
  });

  // -------------------------------------------------------------------------
  // Default branch detection
  // -------------------------------------------------------------------------

  it('detects default branch from symbolic-ref, stripping origin/ prefix', async () => {
    mockReaddir.mockResolvedValue([makeDirent('repo', { isDir: true })]);
    mockRealpath.mockResolvedValue(`${WORKSPACE}/repo`);
    mockStat.mockResolvedValue(dirStat);
    mockExecFileWith([{ stdout: 'origin/main\n' }]);

    const [repo] = await scanWorkspace(WORKSPACE);

    expect(repo?.defaultBranch).toBe('main');
  });

  it('falls back to "main" when symbolic-ref fails but refs/heads/main exists', async () => {
    mockReaddir.mockResolvedValue([makeDirent('repo', { isDir: true })]);
    mockRealpath.mockResolvedValue(`${WORKSPACE}/repo`);
    mockStat.mockResolvedValue(dirStat);
    mockExecFileWith([
      { error: new Error('no remote') }, // symbolic-ref fails
      { stdout: '' }, // show-ref main → exit 0
    ]);

    const [repo] = await scanWorkspace(WORKSPACE);

    expect(repo?.defaultBranch).toBe('main');
  });

  it('falls back to "master" when symbolic-ref fails and only refs/heads/master exists', async () => {
    mockReaddir.mockResolvedValue([makeDirent('repo', { isDir: true })]);
    mockRealpath.mockResolvedValue(`${WORKSPACE}/repo`);
    mockStat.mockResolvedValue(dirStat);
    mockExecFileWith([
      { error: new Error('no remote') }, // symbolic-ref fails
      { error: new Error('no main') }, // show-ref main fails
      { stdout: '' }, // show-ref master → exit 0
    ]);

    const [repo] = await scanWorkspace(WORKSPACE);

    expect(repo?.defaultBranch).toBe('master');
  });

  it('falls back to "main" when all git commands fail', async () => {
    mockReaddir.mockResolvedValue([makeDirent('repo', { isDir: true })]);
    mockRealpath.mockResolvedValue(`${WORKSPACE}/repo`);
    mockStat.mockResolvedValue(dirStat);
    mockExecFileWith([
      { error: new Error('no remote') }, // symbolic-ref fails
      { error: new Error('no main') }, // show-ref main fails
      { error: new Error('no master') }, // show-ref master fails
    ]);

    const [repo] = await scanWorkspace(WORKSPACE);

    expect(repo?.defaultBranch).toBe('main');
  });

  // -------------------------------------------------------------------------
  // Sorting and multi-repo
  // -------------------------------------------------------------------------

  it('returns multiple repos sorted alphabetically by name', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('zebra', { isDir: true }),
      makeDirent('alpha', { isDir: true }),
      makeDirent('middle', { isDir: true }),
    ]);
    mockRealpath
      .mockResolvedValueOnce(`${WORKSPACE}/zebra`)
      .mockResolvedValueOnce(`${WORKSPACE}/alpha`)
      .mockResolvedValueOnce(`${WORKSPACE}/middle`);
    mockStat.mockResolvedValue(dirStat);
    // Each repo needs 1 symbolic-ref call
    mockExecFile.mockImplementation((_cmd, _args, callback: unknown) => {
      (callback as (err: null, stdout: string) => void)(null, 'origin/main\n');
      return {} as ReturnType<typeof execFile>;
    });

    const result = await scanWorkspace(WORKSPACE);

    expect(result.map((r) => r.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  // -------------------------------------------------------------------------
  // Per-repo error resilience
  // -------------------------------------------------------------------------

  it('skips a repo that throws unexpectedly and returns the rest', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('bad-repo', { isDir: true }),
      makeDirent('good-repo', { isDir: true }),
    ]);
    // bad-repo: realpath throws; good-repo: works fine
    mockRealpath
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValueOnce(`${WORKSPACE}/good-repo`);
    mockStat.mockResolvedValue(dirStat);
    mockExecFileWith([{ stdout: 'origin/main\n' }]);

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([
      { name: 'good-repo', path: `${WORKSPACE}/good-repo`, defaultBranch: 'main' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Special directory names
  // -------------------------------------------------------------------------

  it('treats .george-foreman directory as a valid repo if it has a .git directory', async () => {
    mockReaddir.mockResolvedValue([makeDirent('.george-foreman', { isDir: true })]);
    mockRealpath.mockResolvedValue(`${WORKSPACE}/.george-foreman`);
    mockStat.mockResolvedValue(dirStat);
    mockExecFileWith([{ stdout: 'origin/main\n' }]);

    const result = await scanWorkspace(WORKSPACE);

    expect(result).toEqual([
      { name: '.george-foreman', path: `${WORKSPACE}/.george-foreman`, defaultBranch: 'main' },
    ]);
  });
});

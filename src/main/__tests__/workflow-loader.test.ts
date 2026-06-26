// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------
import { app } from 'electron';
import * as fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadWorkflows } from '../workflow-loader.ts';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn() },
}));

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

const mockGetAppPath = vi.mocked(app.getAppPath);
const mockReaddir = vi.mocked(fs.readdir);
const mockReadFile = vi.mocked(fs.readFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_PATH = '/workspace/my-repo';
const BUILTIN_DIR = '/app/workflows';
const USER_DIR = '/user/workflows';

const makeConfig = (overrides: { userWorkflowsFolder?: string | null } = {}) => ({
  workspaceFolder: '/workspace',
  githubHandle: 'testuser',
  userWorkflowsFolder: overrides.userWorkflowsFolder ?? null,
  defaultCopyGlobs: '.env',
  windowBounds: null,
});

// Build a Dirent-like object for readdir({ withFileTypes: true })
const makeDirent = (name: string, isFile = true) =>
  ({ name, isFile: () => isFile }) as unknown as Awaited<ReturnType<typeof fs.readdir>>[number];

const VALID_YAML = `
name: Test Workflow
tasks:
  - name: Do the thing
    prompt: Do it
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadWorkflows', () => {
  beforeEach(() => {
    mockGetAppPath.mockReturnValue('/app');
    // Default: all dirs return empty
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Cycle 1 — tracer bullet: builtin .yml
  // -------------------------------------------------------------------------

  it('loads a valid .yml file from the builtin directory', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('example.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(VALID_YAML);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Test Workflow',
      source: 'builtin',
      tasks: [{ name: 'Do the thing', prompt: 'Do it' }],
    });
  });

  // -------------------------------------------------------------------------
  // Cycle 2 — accepts .yaml extension
  // -------------------------------------------------------------------------

  it('loads a valid .yaml file from the builtin directory', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('example.yaml')];
      return [];
    });
    mockReadFile.mockResolvedValue(VALID_YAML);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Test Workflow');
  });

  // -------------------------------------------------------------------------
  // Cycle 3 — ignores non-YAML files
  // -------------------------------------------------------------------------

  it('ignores non-YAML files (.json, .txt, .md)', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR)
        return [makeDirent('schema.json'), makeDirent('README.md'), makeDirent('notes.txt')];
      return [];
    });

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(0);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cycle 4 — loads from repo source
  // -------------------------------------------------------------------------

  it('loads workflows from the repo .george-foreman/workflows directory', async () => {
    const repoWorkflowsDir = `${REPO_PATH}/.george-foreman/workflows`;
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === repoWorkflowsDir) return [makeDirent('my-workflow.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(VALID_YAML);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('repo');
  });

  // -------------------------------------------------------------------------
  // Cycle 5 — loads from user source
  // -------------------------------------------------------------------------

  it('loads workflows from the user workflows folder when configured', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === USER_DIR) return [makeDirent('user-workflow.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(VALID_YAML);

    const result = await loadWorkflows({
      repoPath: REPO_PATH,
      config: makeConfig({ userWorkflowsFolder: USER_DIR }),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('user');
  });

  // -------------------------------------------------------------------------
  // Cycle 6 — correct order: repo → user → builtin
  // -------------------------------------------------------------------------

  it('returns workflows in order: repo, user, builtin', async () => {
    const repoWorkflowsDir = `${REPO_PATH}/.george-foreman/workflows`;

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === repoWorkflowsDir) return [makeDirent('repo.yml')];
      if (dir === USER_DIR) return [makeDirent('user.yml')];
      if (dir === BUILTIN_DIR) return [makeDirent('builtin.yml')];
      return [];
    });
    mockReadFile.mockImplementation(async (filePath) => {
      const nameByFile: Record<string, string> = {
        'repo.yml': 'Repo Workflow',
        'user.yml': 'User Workflow',
        'builtin.yml': 'Builtin Workflow',
      };
      const key = Object.keys(nameByFile).find((k) => String(filePath).includes(k));
      const name = key ? nameByFile[key] : 'Unknown Workflow';
      return `name: ${name}\ntasks:\n  - name: t\n    prompt: p`;
    });

    const result = await loadWorkflows({
      repoPath: REPO_PATH,
      config: makeConfig({ userWorkflowsFolder: USER_DIR }),
    });

    expect(result.map((w) => w.source)).toEqual(['repo', 'user', 'builtin']);
  });

  // -------------------------------------------------------------------------
  // Cycles 7–9 — argument auto-detection + explicit field
  // -------------------------------------------------------------------------

  it('auto-detects argument as "none" when no prompt contains {{argument}}', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('w.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(`name: W\ntasks:\n  - name: t\n    prompt: no placeholder here`);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result[0]?.argument).toBe('none');
  });

  it('auto-detects argument as "required" when any prompt contains {{argument}}', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('w.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(
      `name: W\ntasks:\n  - name: t\n    prompt: Do this for {{argument}}`,
    );

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result[0]?.argument).toBe('required');
  });

  it('respects explicit argument field and does not override it', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('w.yml')];
      return [];
    });
    // argument: optional, but no {{argument}} in prompt — should stay 'optional'
    mockReadFile.mockResolvedValue(
      `name: W\nargument: optional\ntasks:\n  - name: t\n    prompt: no placeholder`,
    );

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result[0]?.argument).toBe('optional');
  });

  it('respects explicit argument: none even when {{argument}} appears in a prompt', async () => {
    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('w.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(
      `name: W\nargument: none\ntasks:\n  - name: t\n    prompt: Do {{argument}}`,
    );

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result[0]?.argument).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Cycle 10 — userWorkflowsFolder === null → silent skip
  // -------------------------------------------------------------------------

  it('silently skips user source when userWorkflowsFolder is null', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    mockReaddir.mockResolvedValue([]);

    await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig({ userWorkflowsFolder: null }) });

    // readdir should NOT have been called with USER_DIR or any user path
    const calledDirs = mockReaddir.mock.calls.map((c) => c[0]);
    expect(calledDirs).not.toContain(USER_DIR);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cycle 11 — missing directory → console.warn + empty
  // -------------------------------------------------------------------------

  it('warns and returns empty when a workflow directory does not exist', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) throw enoent;
      return [];
    });

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('directory not found'));
  });

  it('continues loading other sources when one directory is missing', async () => {
    const repoWorkflowsDir = `${REPO_PATH}/.george-foreman/workflows`;
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === repoWorkflowsDir) throw enoent; // repo dir missing
      if (dir === BUILTIN_DIR) return [makeDirent('builtin.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(VALID_YAML);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('builtin');
  });

  // -------------------------------------------------------------------------
  // Cycle 12 — YAML parse error → console.warn + skip file
  // -------------------------------------------------------------------------

  it('warns and skips a file with a YAML syntax error', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('bad.yml'), makeDirent('good.yml')];
      return [];
    });
    mockReadFile.mockImplementation(async (filePath) => {
      if (String(filePath).includes('bad.yml')) return ': invalid: yaml: {{{';
      return VALID_YAML;
    });

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Test Workflow');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bad.yml'), expect.anything());
  });

  // -------------------------------------------------------------------------
  // Cycles 13–15 — Zod validation failures → skip
  // -------------------------------------------------------------------------

  it('skips a workflow file missing the required name field', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('noname.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(`tasks:\n  - name: t\n    prompt: p`);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('skips a workflow file with an empty tasks array', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('emptytasks.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(`name: W\ntasks: []`);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('skips a workflow file where a task has an empty prompt', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === BUILTIN_DIR) return [makeDirent('emptyprompt.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(`name: W\ntasks:\n  - name: t\n    prompt: ""`);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cycle 16 — same workflow name from different sources → both returned
  // -------------------------------------------------------------------------

  it('returns both workflows when two sources define workflows with the same name', async () => {
    const repoWorkflowsDir = `${REPO_PATH}/.george-foreman/workflows`;
    const SAME_NAME_YAML = `name: Shared Name\ntasks:\n  - name: t\n    prompt: p`;

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === repoWorkflowsDir) return [makeDirent('w.yml')];
      if (dir === BUILTIN_DIR) return [makeDirent('w.yml')];
      return [];
    });
    mockReadFile.mockResolvedValue(SAME_NAME_YAML);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(2);
    expect(result.map((w) => w.source)).toEqual(['repo', 'builtin']);
    expect(result.every((w) => w.name === 'Shared Name')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Cycle 17 — empty directory → []
  // -------------------------------------------------------------------------

  it('returns empty array when all directories have no YAML files', async () => {
    mockReaddir.mockResolvedValue([]);

    const result = await loadWorkflows({ repoPath: REPO_PATH, config: makeConfig() });

    expect(result).toHaveLength(0);
  });
});

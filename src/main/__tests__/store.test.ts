import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storeGet, storeSet } from '../store.ts';

// ---------------------------------------------------------------------------
// Mock electron-store BEFORE importing store.ts (which runs migration on import)
// ---------------------------------------------------------------------------

// vi.hoisted ensures dataRef is available inside the hoisted vi.mock factory
const { dataRef } = vi.hoisted(() => ({
  dataRef: { current: {} as Record<string, unknown> },
}));

// The mock is hoisted by Vitest's transform, so it runs before the static
// import above regardless of source order.
vi.mock('electron-store', () => ({
  default: class MockElectronStore {
    defaults: Record<string, unknown>;

    constructor(options: { defaults?: Record<string, unknown> } = {}) {
      this.defaults = options.defaults ?? {};
      // Apply defaults for keys not already present
      for (const [key, value] of Object.entries(this.defaults)) {
        if (!(key in dataRef.current)) {
          dataRef.current[key] = value;
        }
      }
    }

    get(key: string): unknown {
      return dataRef.current[key];
    }

    set(key: string, value: unknown): void {
      dataRef.current[key] = value;
    }

    clear(): void {
      dataRef.current = {};
    }

    get store(): Record<string, unknown> {
      return { ...dataRef.current };
    }
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STORE = {
  schemaVersion: 1 as const,
  config: {
    workspaceFolder: '/Users/test/workspace',
    githubHandle: 'testuser',
    userWorkflowsFolder: null,
    defaultCopyGlobs: '.env\n.env.*\n.env.local',
    windowBounds: null,
  },
  jobs: {},
  jobLogs: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('store defaults', () => {
  it('pre-populates defaultCopyGlobs with .env patterns', () => {
    const config = storeGet('config');
    expect(config.defaultCopyGlobs).toBe('.env\n.env.*\n.env.local');
  });

  it('defaults workspaceFolder to empty string', () => {
    const config = storeGet('config');
    expect(config.workspaceFolder).toBe('');
  });

  it('defaults githubHandle to empty string', () => {
    const config = storeGet('config');
    expect(config.githubHandle).toBe('');
  });

  it('defaults userWorkflowsFolder to null', () => {
    const config = storeGet('config');
    expect(config.userWorkflowsFolder).toBeNull();
  });

  it('defaults windowBounds to null', () => {
    const config = storeGet('config');
    expect(config.windowBounds).toBeNull();
  });

  it('defaults jobs to empty object', () => {
    expect(storeGet('jobs')).toEqual({});
  });

  it('defaults jobLogs to empty object', () => {
    expect(storeGet('jobLogs')).toEqual({});
  });

  it('sets schemaVersion to 1', () => {
    expect(storeGet('schemaVersion')).toBe(1);
  });
});

describe('startup migration — schema version mismatch', () => {
  beforeEach(() => {
    dataRef.current = {};
  });

  it('clears jobs and resets schemaVersion when version is wrong', async () => {
    dataRef.current = {
      schemaVersion: 0,
      config: {
        workspaceFolder: '/kept',
        githubHandle: 'kept',
        userWorkflowsFolder: null,
        defaultCopyGlobs: '',
        windowBounds: null,
      },
      jobs: { 'job-abc': { id: 'job-abc' } },
      jobLogs: { 'job-abc': 'some log' },
    };

    vi.resetModules();
    const { storeGet: freshGet } = await import('../store.ts');

    expect(freshGet('schemaVersion')).toBe(1);
    expect(freshGet('jobs')).toEqual({});
    expect(freshGet('jobLogs')).toEqual({});
  });

  it('preserves config when migrating due to version mismatch', async () => {
    dataRef.current = {
      schemaVersion: 0,
      config: {
        workspaceFolder: '/Users/preserved',
        githubHandle: 'preserved-user',
        userWorkflowsFolder: null,
        defaultCopyGlobs: '.env',
        windowBounds: null,
      },
      jobs: {},
      jobLogs: {},
    };

    vi.resetModules();
    const { storeGet: freshGet } = await import('../store.ts');

    const config = freshGet('config');
    expect(config.workspaceFolder).toBe('/Users/preserved');
    expect(config.githubHandle).toBe('preserved-user');
  });
});

describe('startup migration — Zod parse failure (corrupt data)', () => {
  beforeEach(() => {
    dataRef.current = {};
  });

  it('clears jobs when store has correct version but corrupt shape', async () => {
    dataRef.current = {
      schemaVersion: 1,
      config: {
        workspaceFolder: '/test',
        githubHandle: 'user',
        userWorkflowsFolder: null,
        defaultCopyGlobs: '.env',
        windowBounds: null,
      },
      jobs: 'not-an-object', // invalid — should be a Record
      jobLogs: {},
    };

    vi.resetModules();
    const { storeGet: freshGet } = await import('../store.ts');

    expect(freshGet('schemaVersion')).toBe(1);
    expect(freshGet('jobs')).toEqual({});
  });

  it('preserves config when migrating due to Zod parse failure', async () => {
    dataRef.current = {
      schemaVersion: 1,
      config: {
        workspaceFolder: '/Users/corrupt-test',
        githubHandle: 'corrupt-user',
        userWorkflowsFolder: null,
        defaultCopyGlobs: '.env',
        windowBounds: null,
      },
      jobs: 42, // invalid
      jobLogs: {},
    };

    vi.resetModules();
    const { storeGet: freshGet } = await import('../store.ts');

    const config = freshGet('config');
    expect(config.workspaceFolder).toBe('/Users/corrupt-test');
    expect(config.githubHandle).toBe('corrupt-user');
  });

  it('does NOT migrate when store is valid', async () => {
    // Use a fully-valid Job object so schStore.safeParse passes
    const validJob = {
      id: 'job-123',
      repoName: 'my-app',
      repoPath: '/workspace/my-app',
      worktreePath: '/workspace/my-app--main',
      worktreeDeleted: false,
      branchName: 'main',
      baseBranch: 'main',
      workflowName: 'Implement Feature',
      argument: 'AV-123',
      status: 'running',
      port: 4096,
      orchestratorSessionId: null,
      tasks: [],
      createdAt: 1234567890,
      completedAt: null,
      archivedAt: null,
      errorMessage: null,
      pendingPermission: null,
    };
    dataRef.current = {
      ...VALID_STORE,
      jobs: { 'job-123': validJob },
    };

    vi.resetModules();
    const { storeGet: freshGet } = await import('../store.ts');

    // Jobs should be preserved — no migration happened
    const jobs = freshGet('jobs') as Record<string, unknown>;
    expect(jobs['job-123']).toBeDefined();
  });
});

describe('storeGet / storeSet round-trips', () => {
  beforeEach(() => {
    dataRef.current = { ...VALID_STORE };
  });

  it('storeGet returns the current value for a key', () => {
    dataRef.current['schemaVersion'] = 1;
    expect(storeGet('schemaVersion')).toBe(1);
  });

  it('storeSet writes a value that storeGet can read back', () => {
    const newConfig = {
      workspaceFolder: '/new/path',
      githubHandle: 'new-user',
      userWorkflowsFolder: '/workflows',
      defaultCopyGlobs: '.env\n.secrets',
      windowBounds: { x: 100, y: 200, width: 900, height: 650 },
    };
    storeSet('config', newConfig);
    expect(storeGet('config')).toEqual(newConfig);
  });

  it('storeSet writes jobs and storeGet reads them back', () => {
    const jobs = {
      'job-abc': {
        id: 'job-abc',
        repoName: 'my-app',
        repoPath: '/workspace/my-app',
        worktreePath: '/workspace/my-app--main',
        worktreeDeleted: false,
        branchName: 'main',
        baseBranch: 'main',
        workflowName: 'Implement Feature',
        argument: 'AV-123',
        status: 'running' as const,
        port: 4096,
        orchestratorSessionId: 'sess-1',
        tasks: [],
        createdAt: 1234567890,
        completedAt: null,
        archivedAt: null,
        errorMessage: null,
        pendingPermission: null,
      },
    };
    storeSet('jobs', jobs);
    expect(storeGet('jobs')).toEqual(jobs);
  });

  it('storeSet writes jobLogs and storeGet reads them back', () => {
    storeSet('jobLogs', { 'job-abc': 'stdout line 1\nstdout line 2' });
    expect(storeGet('jobLogs')).toEqual({ 'job-abc': 'stdout line 1\nstdout line 2' });
  });

  it('storeGet key name is passed through correctly (no key mangling)', () => {
    dataRef.current['schemaVersion'] = 1;
    dataRef.current['config'] = VALID_STORE.config;
    // If the wrapper accidentally uses a different key, these will differ
    expect(storeGet('schemaVersion')).toBe(dataRef.current['schemaVersion']);
    expect(storeGet('config')).toEqual(dataRef.current['config']);
  });
});

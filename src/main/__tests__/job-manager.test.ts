// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that trigger the mocked modules
// ---------------------------------------------------------------------------
/* eslint-disable camelcase */
// OrchestratorEvent uses snake_case keys (task_index, session_id) to match the
// OpenCode wire protocol. Same exemption as src/shared/types/sse.ts.
import type { BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from '../../shared/types/job.ts';
import type { OrchestratorEvent, Permission } from '../../shared/types/sse.ts';
import { createJobManager } from '../job-manager.ts';
import { storeGet } from '../store.ts';

// ---------------------------------------------------------------------------
// vi.hoisted — only mock factories (need to be available before vi.mock calls)
// ---------------------------------------------------------------------------

const { dataRef, mockProcessCtor, mockClientCtor } = vi.hoisted(() => ({
  dataRef: { current: {} as Record<string, unknown> },
  mockProcessCtor: vi.fn(),
  mockClientCtor: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fake process/client instances — created at module level (after EventEmitter import)
// ---------------------------------------------------------------------------

type FakeProcess = InstanceType<typeof EventEmitter> & {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  getLog: ReturnType<typeof vi.fn>;
};

type FakeClient = InstanceType<typeof EventEmitter> & {
  createSession: ReturnType<typeof vi.fn>;
  sendWorkflow: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  respondPermission: ReturnType<typeof vi.fn>;
  fetchMessages: ReturnType<typeof vi.fn>;
  abortSession: ReturnType<typeof vi.fn>;
  connectSse: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const makeFakeProcess = (): FakeProcess => {
  const inst = new EventEmitter() as FakeProcess;
  inst.start = vi.fn();
  inst.stop = vi.fn().mockResolvedValue(undefined);
  inst.getLog = vi.fn().mockReturnValue('fake-log');
  return inst;
};

const makeFakeClient = (): FakeClient => {
  const inst = new EventEmitter() as FakeClient;
  inst.createSession = vi.fn().mockResolvedValue('sess-orch-1');
  inst.sendWorkflow = vi.fn().mockResolvedValue(undefined);
  inst.sendMessage = vi.fn().mockResolvedValue(undefined);
  inst.respondPermission = vi.fn().mockResolvedValue(undefined);
  inst.fetchMessages = vi.fn().mockResolvedValue([]);
  inst.abortSession = vi.fn().mockResolvedValue(undefined);
  inst.connectSse = vi.fn();
  inst.destroy = vi.fn();
  return inst;
};

// Singletons shared across tests — reset in beforeEach
const fakeProcessInstance = makeFakeProcess();
const fakeClientInstance = makeFakeClient();

// Point the constructors at the singletons immediately
mockProcessCtor.mockReturnValue(fakeProcessInstance);
mockClientCtor.mockReturnValue(fakeClientInstance);

vi.mock('electron-store', () => ({
  default: class MockElectronStore {
    defaults: Record<string, unknown>;

    constructor(options: { defaults?: Record<string, unknown> } = {}) {
      this.defaults = options.defaults ?? {};
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

vi.mock('../opencode-process.ts', () => ({
  OpenCodeProcess: mockProcessCtor,
}));

vi.mock('../opencode.ts', () => ({
  OpenCodeClient: mockClientCtor,
}));

const { mockCreateWorktree, mockDeleteWorktree, mockGetWorktreePath } = vi.hoisted(() => ({
  mockCreateWorktree: vi.fn().mockResolvedValue(undefined),
  mockDeleteWorktree: vi.fn().mockResolvedValue({ success: true }),
  mockDeleteWorktreeForce: vi.fn().mockResolvedValue({ success: true }),
  mockGetWorktreePath: vi
    .fn()
    .mockImplementation(
      (_workspace: string, repoName: string, branchName: string) =>
        `/workspace/${repoName}--${branchName}`,
    ),
}));

vi.mock('../worktree.ts', () => ({
  createWorktree: mockCreateWorktree,
  deleteWorktree: mockDeleteWorktree,
  deleteWorktreeForce: vi.fn().mockResolvedValue({ success: true }),
  getWorktreePath: mockGetWorktreePath,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DATA = {
  schemaVersion: 1,
  config: {
    workspaceFolder: '/workspace',
    githubHandle: 'pdoucet',
    userWorkflowsFolder: null,
    defaultCopyGlobs: '.env\n.env.*',
    windowBounds: null,
  },
  jobs: {} as Record<string, Job>,
  jobLogs: {} as Record<string, string>,
};

const makeWindow = (): BrowserWindow =>
  ({ webContents: { send: vi.fn() } }) as unknown as BrowserWindow;

const DEFAULT_PARAMS = {
  repoPath: '/repos/my-app',
  workflowName: 'Implement',
  workflowTasks: [
    { name: 'Task 1', prompt: 'Do thing 1' },
    { name: 'Task 2', prompt: 'Do thing 2' },
  ],
  argument: 'AV-123',
  branchName: 'AV-123/implement',
  baseBranch: 'main',
};

// Helper: trigger process 'ready' event to unblock createJob
const triggerReady = (port = 3000): void => {
  fakeProcessInstance.emit('ready', { port });
};

// Flush all pending microtasks (multiple promise chain steps in createJob)
const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createJobManager', () => {
  let win: BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    dataRef.current = structuredClone(DEFAULT_DATA) as Record<string, unknown>;
    win = makeWindow();

    // Re-configure fakes after clearAllMocks
    fakeProcessInstance.start = vi.fn();
    fakeProcessInstance.stop = vi.fn().mockResolvedValue(undefined);
    fakeProcessInstance.getLog = vi.fn().mockReturnValue('fake-log');
    mockProcessCtor.mockReturnValue(fakeProcessInstance);

    fakeClientInstance.createSession = vi.fn().mockResolvedValue('sess-orch-1');
    fakeClientInstance.sendWorkflow = vi.fn().mockResolvedValue(undefined);
    fakeClientInstance.sendMessage = vi.fn().mockResolvedValue(undefined);
    fakeClientInstance.respondPermission = vi.fn().mockResolvedValue(undefined);
    fakeClientInstance.fetchMessages = vi.fn().mockResolvedValue([]);
    fakeClientInstance.abortSession = vi.fn().mockResolvedValue(undefined);
    fakeClientInstance.connectSse = vi.fn();
    fakeClientInstance.destroy = vi.fn();
    // Remove all listeners from previous tests
    fakeClientInstance.removeAllListeners();
    fakeProcessInstance.removeAllListeners();
    mockClientCtor.mockReturnValue(fakeClientInstance);

    mockCreateWorktree.mockResolvedValue(undefined);
    mockDeleteWorktree.mockResolvedValue({ success: true });
    mockGetWorktreePath.mockImplementation(
      (_workspace: string, repoName: string, branchName: string) =>
        `/workspace/${repoName}--${branchName}`,
    );
  });

  afterEach(() => {
    fakeClientInstance.removeAllListeners();
    fakeProcessInstance.removeAllListeners();
  });

  // -------------------------------------------------------------------------
  // createJob — happy path
  // -------------------------------------------------------------------------

  describe('createJob — happy path', () => {
    it('creates a job, spawns process, connects SSE, marks running', async () => {
      const mgr = createJobManager(win);

      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);

      const job = await jobPromise;

      expect(job.status).toBe('running');
      expect(job.port).toBe(3000);
      expect(job.orchestratorSessionId).toBe('sess-orch-1');
      expect(fakeProcessInstance.start).toHaveBeenCalledOnce();
      expect(fakeClientInstance.createSession).toHaveBeenCalledOnce();
      expect(fakeClientInstance.sendWorkflow).toHaveBeenCalledOnce();
      expect(fakeClientInstance.connectSse).toHaveBeenCalledOnce();
    });

    it('persists job:created then job:updated(running) push events', async () => {
      const send = vi.mocked(win.webContents.send);
      const mgr = createJobManager(win);

      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      await jobPromise;

      const createdCall = send.mock.calls.find(([ch]) => ch === 'job:created');
      const updatedCalls = send.mock.calls.filter(([ch]) => ch === 'job:updated');

      expect(createdCall).toBeDefined();
      expect(createdCall![1]).toMatchObject({ status: 'pending' });

      const lastUpdated = updatedCalls[updatedCalls.length - 1];
      expect(lastUpdated[1]).toMatchObject({ status: 'running' });
    });

    it('initialises tasks with pending status', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      expect(job.tasks).toHaveLength(2);
      expect(job.tasks[0]).toMatchObject({ index: 0, name: 'Task 1', status: 'pending' });
      expect(job.tasks[1]).toMatchObject({ index: 1, name: 'Task 2', status: 'pending' });
    });
  });

  // -------------------------------------------------------------------------
  // createJob — failure paths
  // -------------------------------------------------------------------------

  describe('createJob — failure paths', () => {
    it('marks job failed when createWorktree throws', async () => {
      mockCreateWorktree.mockRejectedValueOnce(new Error('worktree error'));
      const send = vi.mocked(win.webContents.send);
      const mgr = createJobManager(win);

      await expect(mgr.createJob(DEFAULT_PARAMS)).rejects.toThrow('worktree error');

      const failedCall = send.mock.calls.find(
        ([ch, job]) => ch === 'job:updated' && (job as Job).status === 'failed',
      );
      expect(failedCall).toBeDefined();
      expect((failedCall![1] as Job).errorMessage).toBe('worktree error');
      expect(fakeProcessInstance.start).not.toHaveBeenCalled();
    });

    it('marks job failed when process emits failed before ready', async () => {
      const send = vi.mocked(win.webContents.send);
      const mgr = createJobManager(win);

      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      fakeProcessInstance.emit('failed', { reason: 'spawn error', log: 'log-output' });

      await expect(jobPromise).rejects.toThrow('spawn error');

      const failedCall = send.mock.calls.find(
        ([ch, job]) => ch === 'job:updated' && (job as Job).status === 'failed',
      );
      expect(failedCall).toBeDefined();
      expect((failedCall![1] as Job).errorMessage).toBe('spawn error');
    });

    it('marks job failed when createSession throws', async () => {
      fakeClientInstance.createSession = vi.fn().mockRejectedValueOnce(new Error('session error'));
      const send = vi.mocked(win.webContents.send);
      const mgr = createJobManager(win);

      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);

      await expect(jobPromise).rejects.toThrow('session error');

      const failedCall = send.mock.calls.find(
        ([ch, job]) => ch === 'job:updated' && (job as Job).status === 'failed',
      );
      expect(failedCall).toBeDefined();
      expect((failedCall![1] as Job).errorMessage).toBe('session error');
      expect(fakeProcessInstance.stop).toHaveBeenCalled();
    });

    it('marks job failed when sendWorkflow throws', async () => {
      fakeClientInstance.sendWorkflow = vi.fn().mockRejectedValueOnce(new Error('workflow error'));
      const send = vi.mocked(win.webContents.send);
      const mgr = createJobManager(win);

      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);

      await expect(jobPromise).rejects.toThrow('workflow error');

      const failedCall = send.mock.calls.find(
        ([ch, job]) => ch === 'job:updated' && (job as Job).status === 'failed',
      );
      expect(failedCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // SSE event handling — orchestrator events
  // -------------------------------------------------------------------------

  describe('orchestrator events', () => {
    const setup = async (): Promise<{
      mgr: ReturnType<typeof createJobManager>;
      jobId: string;
    }> => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;
      return { mgr, jobId: job.id };
    };

    it('task_started → sets task status to in_progress', async () => {
      const { jobId } = await setup();

      const event: OrchestratorEvent = {
        type: 'task_started',
        task_index: 0,
        session_id: 'sess-orch-1',
      };
      fakeClientInstance.emit('orchestratorEvent', { event });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[jobId].tasks[0].status).toBe('in_progress');
    });

    it('subagent_spawned → sets subagentSessionId', async () => {
      const { jobId } = await setup();
      const event: OrchestratorEvent = {
        type: 'subagent_spawned',
        task_index: 0,
        session_id: 'sess-sub-1',
      };
      fakeClientInstance.emit('orchestratorEvent', { event });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[jobId].tasks[0].subagentSessionId).toBe('sess-sub-1');
    });

    it('task_completed → sets task status to completed', async () => {
      const { jobId } = await setup();
      fakeClientInstance.emit('orchestratorEvent', {
        event: { type: 'task_started', task_index: 0, session_id: 'sess-orch-1' },
      });
      await flushMicrotasks();

      const event: OrchestratorEvent = { type: 'task_completed', task_index: 0 };
      fakeClientInstance.emit('orchestratorEvent', { event });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[jobId].tasks[0].status).toBe('completed');
    });

    it('workflow_completed → job status completed, archivedAt set, worktree deleted', async () => {
      const { jobId } = await setup();

      fakeClientInstance.emit('orchestratorEvent', { event: { type: 'workflow_completed' } });
      await new Promise((r) => setTimeout(r, 10));

      const jobs = storeGet('jobs');
      expect(jobs[jobId].status).toBe('completed');
      expect(jobs[jobId].archivedAt).not.toBeNull();
      expect(mockDeleteWorktree).toHaveBeenCalled();
    });

    it('workflow_completed → sets all tasks to completed', async () => {
      const { jobId } = await setup();
      fakeClientInstance.emit('orchestratorEvent', {
        event: { type: 'task_started', task_index: 0, session_id: 'sess-orch-1' },
      });
      await flushMicrotasks();

      fakeClientInstance.emit('orchestratorEvent', { event: { type: 'workflow_completed' } });
      await new Promise((r) => setTimeout(r, 10));

      const jobs = storeGet('jobs');
      expect(jobs[jobId].tasks.every((t) => t.status === 'completed')).toBe(true);
    });

    it('workflow_completed sets worktreeDeleted=false when delete fails', async () => {
      mockDeleteWorktree.mockResolvedValueOnce({ success: false, hasUncommittedChanges: true });
      const { jobId } = await setup();

      fakeClientInstance.emit('orchestratorEvent', { event: { type: 'workflow_completed' } });
      await new Promise((r) => setTimeout(r, 10));

      const jobs = storeGet('jobs');
      expect(jobs[jobId].worktreeDeleted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // SSE event handling — permission
  // -------------------------------------------------------------------------

  describe('permission event', () => {
    it('sets job status to needs_attention and stores pendingPermission', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      const permission: Permission = {
        id: 'perm-1',
        type: 'bash',
        sessionID: 'sess-sub-2',
        messageID: 'msg-1',
        title: 'Run bash command',
        metadata: {},
        time: { created: Date.now() },
      };
      fakeClientInstance.emit('permission', { permission });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('needs_attention');
      expect(jobs[job.id].pendingPermission).toMatchObject({
        permissionId: 'perm-1',
        sessionId: 'sess-sub-2',
        description: 'Run bash command',
        permissionType: 'bash',
      });
    });
  });

  // -------------------------------------------------------------------------
  // SSE event handling — session.idle
  // -------------------------------------------------------------------------

  describe('session.idle', () => {
    it('ignores session.idle from foreign session IDs', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('sessionIdle', { sessionId: 'foreign-session' });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('running');
    });

    it('ignores session.idle when job is needs_attention', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      const permission: Permission = {
        id: 'perm-1',
        type: 'bash',
        sessionID: 'sess-orch-1',
        messageID: 'msg-1',
        title: 'Title',
        metadata: {},
        time: { created: Date.now() },
      };
      fakeClientInstance.emit('permission', { permission });
      await flushMicrotasks();

      fakeClientInstance.emit('sessionIdle', { sessionId: 'sess-orch-1' });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('needs_attention');
    });

    it('completes job on session.idle if orchestrator session and all tasks completed', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('orchestratorEvent', {
        event: { type: 'task_completed', task_index: 0 },
      });
      fakeClientInstance.emit('orchestratorEvent', {
        event: { type: 'task_completed', task_index: 1 },
      });
      await new Promise((r) => setTimeout(r, 10));

      fakeClientInstance.emit('sessionIdle', { sessionId: 'sess-orch-1' });
      await new Promise((r) => setTimeout(r, 10));

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('completed');
    });

    it('does not complete job on session.idle if tasks incomplete', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('sessionIdle', { sessionId: 'sess-orch-1' });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('running');
    });

    it('ignores session.idle after workflow_completed was received', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('orchestratorEvent', { event: { type: 'workflow_completed' } });
      await new Promise((r) => setTimeout(r, 10));

      const send = vi.mocked(win.webContents.send);
      const callsBefore = send.mock.calls.length;

      fakeClientInstance.emit('sessionIdle', { sessionId: 'sess-orch-1' });
      await new Promise((r) => setTimeout(r, 10));

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('completed');
      expect(send.mock.calls.length).toBe(callsBefore);
    });
  });

  // -------------------------------------------------------------------------
  // SSE event handling — session.error
  // -------------------------------------------------------------------------

  describe('session.error', () => {
    it('marks job failed on session.error', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('sessionError', { properties: {} });
      await flushMicrotasks();

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('failed');
      expect(jobs[job.id].errorMessage).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // stopJob
  // -------------------------------------------------------------------------

  describe('stopJob', () => {
    it('aborts session, stops process, marks job stopped', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      await mgr.stopJob(job.id);

      expect(fakeClientInstance.abortSession).toHaveBeenCalledWith({
        sessionId: 'sess-orch-1',
      });
      expect(fakeProcessInstance.stop).toHaveBeenCalled();

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('stopped');
    });

    it('is a no-op for already-completed jobs', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('orchestratorEvent', { event: { type: 'workflow_completed' } });
      await new Promise((r) => setTimeout(r, 10));

      fakeClientInstance.abortSession.mockClear();
      await mgr.stopJob(job.id);
      expect(fakeClientInstance.abortSession).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // archiveJob / unarchiveJob
  // -------------------------------------------------------------------------

  describe('archiveJob / unarchiveJob', () => {
    it('sets archivedAt on a failed job', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      fakeProcessInstance.emit('failed', { reason: 'crash', log: '' });
      await expect(jobPromise).rejects.toThrow();

      const [jobId] = Object.keys(storeGet('jobs'));
      await mgr.archiveJob(jobId);

      expect(storeGet('jobs')[jobId].archivedAt).not.toBeNull();
    });

    it('clears archivedAt on unarchive', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      fakeProcessInstance.emit('failed', { reason: 'crash', log: '' });
      await expect(jobPromise).rejects.toThrow();

      const [jobId] = Object.keys(storeGet('jobs'));
      await mgr.archiveJob(jobId);
      await mgr.unarchiveJob(jobId);

      expect(storeGet('jobs')[jobId].archivedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // listActive / listArchive
  // -------------------------------------------------------------------------

  describe('listActive / listArchive', () => {
    it('listActive returns jobs with archivedAt=null', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      expect(mgr.listActive().some((j) => j.id === job.id)).toBe(true);
      expect(mgr.listArchive().some((j) => j.id === job.id)).toBe(false);
    });

    it('listArchive returns completed jobs (archivedAt set)', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('orchestratorEvent', { event: { type: 'workflow_completed' } });
      await new Promise((r) => setTimeout(r, 10));

      expect(mgr.listActive().some((j) => j.id === job.id)).toBe(false);
      expect(mgr.listArchive().some((j) => j.id === job.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // restoreOnStartup
  // -------------------------------------------------------------------------

  describe('restoreOnStartup', () => {
    const makeJob = (id: string, status: Job['status']): Job => ({
      id,
      repoName: 'app',
      repoPath: '/repos/app',
      worktreePath: '/workspace/app--main',
      worktreeDeleted: false,
      branchName: 'main',
      baseBranch: 'main',
      workflowName: 'Implement',
      argument: '',
      status,
      port: null,
      orchestratorSessionId: null,
      tasks: [],
      createdAt: Date.now(),
      completedAt: null,
      archivedAt: null,
      errorMessage: null,
      pendingPermission: null,
    });

    it.each(['pending', 'running', 'needs_attention'] as Job['status'][])(
      'marks %s jobs failed on startup',
      async (status) => {
        dataRef.current['jobs'] = { 'job-1': makeJob('job-1', status) };
        const mgr = createJobManager(win);
        await mgr.restoreOnStartup();

        const jobs = storeGet('jobs');
        expect(jobs['job-1'].status).toBe('failed');
        expect(jobs['job-1'].errorMessage).toContain('restarted');
      },
    );

    it.each(['completed', 'failed', 'stopped'] as Job['status'][])(
      'leaves %s jobs untouched on startup',
      async (status) => {
        dataRef.current['jobs'] = { 'job-1': makeJob('job-1', status) };
        const mgr = createJobManager(win);
        await mgr.restoreOnStartup();

        const jobs = storeGet('jobs');
        expect(jobs['job-1'].status).toBe(status);
      },
    );

    it('sends job:updated for each restored job', async () => {
      dataRef.current['jobs'] = {
        'job-a': makeJob('job-a', 'running'),
        'job-b': makeJob('job-b', 'pending'),
      };
      const mgr = createJobManager(win);
      const send = vi.mocked(win.webContents.send);
      await mgr.restoreOnStartup();

      const updatedIds = send.mock.calls
        .filter(([ch]) => ch === 'job:updated')
        .map(([, job]) => (job as Job).id);
      expect(updatedIds).toContain('job-a');
      expect(updatedIds).toContain('job-b');
    });
  });

  // -------------------------------------------------------------------------
  // Write queue serialization
  // -------------------------------------------------------------------------

  describe('write queue', () => {
    it('serializes two rapid updates without losing either', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      fakeClientInstance.emit('orchestratorEvent', {
        event: { type: 'task_started', task_index: 0, session_id: 'sess-orch-1' },
      });
      fakeClientInstance.emit('orchestratorEvent', {
        event: { type: 'task_started', task_index: 1, session_id: 'sess-orch-1' },
      });
      await new Promise((r) => setTimeout(r, 10));

      const jobs = storeGet('jobs');
      expect(jobs[job.id].tasks[0].status).toBe('in_progress');
      expect(jobs[job.id].tasks[1].status).toBe('in_progress');
    });
  });

  // -------------------------------------------------------------------------
  // respondPermission
  // -------------------------------------------------------------------------

  describe('respondPermission', () => {
    it('calls client.respondPermission with correct sessionId and clears pendingPermission', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      const permission: Permission = {
        id: 'perm-1',
        type: 'bash',
        sessionID: 'sess-sub-99',
        messageID: 'msg-1',
        title: 'Allow bash',
        metadata: {},
        time: { created: Date.now() },
      };
      fakeClientInstance.emit('permission', { permission });
      await flushMicrotasks();

      await mgr.respondPermission({
        jobId: job.id,
        permissionId: 'perm-1',
        response: 'once',
      });

      expect(fakeClientInstance.respondPermission).toHaveBeenCalledWith({
        sessionId: 'sess-sub-99',
        permissionId: 'perm-1',
        response: 'once',
      });

      const jobs = storeGet('jobs');
      expect(jobs[job.id].status).toBe('running');
      expect(jobs[job.id].pendingPermission).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('sends message to orchestrator session', async () => {
      const mgr = createJobManager(win);
      const jobPromise = mgr.createJob(DEFAULT_PARAMS);
      await flushMicrotasks();
      triggerReady(3000);
      const job = await jobPromise;

      await mgr.sendMessage({ jobId: job.id, text: 'Hello agent' });

      expect(fakeClientInstance.sendMessage).toHaveBeenCalledWith({
        sessionId: 'sess-orch-1',
        text: 'Hello agent',
      });
    });
  });
});

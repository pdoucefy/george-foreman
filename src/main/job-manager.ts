import type { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';

import type { SessionMessage } from '../shared/types/ipc.ts';
import type { Job, JobCreateParams, JobStatus, TaskState } from '../shared/types/job.ts';
import type { OrchestratorEvent, Permission } from '../shared/types/sse.ts';
import { OpenCodeProcess } from './opencode-process.ts';
import { OpenCodeClient } from './opencode.ts';
import { storeGet, storeSet } from './store.ts';
import {
  createWorktree,
  deleteWorktree,
  deleteWorktreeForce,
  getWorktreePath,
} from './worktree.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobManager = {
  restoreOnStartup: () => Promise<void>;
  createJob: (params: JobCreateParams) => Promise<Job>;
  stopJob: (jobId: string) => Promise<void>;
  archiveJob: (jobId: string) => Promise<void>;
  unarchiveJob: (jobId: string) => Promise<void>;
  listActive: () => Job[];
  listArchive: () => Job[];
  deleteWorktree: (
    jobId: string,
  ) => Promise<{ success: boolean; hasUncommittedChanges?: boolean; error?: string }>;
  deleteWorktreeForce: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  getLog: (jobId: string) => Promise<string>;
  respondPermission: (params: {
    jobId: string;
    permissionId: string;
    response: 'once' | 'always' | 'reject';
  }) => Promise<void>;
  sendMessage: (params: { jobId: string; text: string }) => Promise<void>;
  getSessionMessages: (params: { jobId: string; sessionId: string }) => Promise<SessionMessage[]>;
};

// ---------------------------------------------------------------------------
// Per-job in-memory runtime state (not persisted)
// ---------------------------------------------------------------------------

type JobRuntime = {
  process: OpenCodeProcess;
  client: OpenCodeClient;
  workflowCompletedReceived: boolean;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createJobManager = (mainWindow: BrowserWindow): JobManager => {
  const runtimes = new Map<string, JobRuntime>();

  // Serialize all electron-store reads+writes to avoid stale reads between rapid events
  let writeQueue: Promise<void> = Promise.resolve();

  /** Serialize an async operation through the write queue (read-modify-write atomically). */
  const enqueueAsync = (fn: () => Promise<void>): Promise<void> => {
    writeQueue = writeQueue.then(() => fn()).catch(console.error);
    return writeQueue;
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const sendJobCreated = (job: Job): void => {
    mainWindow.webContents.send('job:created', job);
  };

  const sendJobUpdated = (job: Job): void => {
    mainWindow.webContents.send('job:updated', job);
  };

  const persistJob = (job: Job): void => {
    const jobs = storeGet('jobs');
    storeSet('jobs', { ...jobs, [job.id]: job });
  };

  const persistLog = (jobId: string, log: string): void => {
    const logs = storeGet('jobLogs');
    storeSet('jobLogs', { ...logs, [jobId]: log });
  };

  const getJob = (jobId: string): Job | null => {
    const jobs = storeGet('jobs');
    return jobs[jobId] ?? null;
  };

  const teardownRuntime = (jobId: string): void => {
    const rt = runtimes.get(jobId);
    if (rt) {
      rt.client.destroy();
      runtimes.delete(jobId);
    }
  };

  // ---------------------------------------------------------------------------
  // SSE event handlers
  // ---------------------------------------------------------------------------

  const completeJob = async (jobId: string): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status === 'completed') return; // idempotent

    const now = Date.now();
    const tasks = job.tasks.map((t) =>
      t.status !== 'completed' ? { ...t, status: 'completed' as const } : t,
    );

    // Attempt worktree deletion (non-forced)
    let worktreeDeleted = false;
    try {
      const result = await deleteWorktree({
        repoPath: job.repoPath,
        worktreePath: job.worktreePath,
      });
      worktreeDeleted = result.success;
    } catch {
      worktreeDeleted = false;
    }

    const updated: Job = {
      ...job,
      tasks,
      status: 'completed',
      completedAt: now,
      archivedAt: now,
      worktreeDeleted,
    };

    teardownRuntime(jobId);
    persistJob(updated);
    sendJobUpdated(updated);
  };

  const handleOrchestratorEvent = async (
    jobId: string,
    event: OrchestratorEvent,
  ): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;

    const rt = runtimes.get(jobId);

    if (event.type === 'task_started') {
      const tasks = job.tasks.map((t) =>
        t.index === event.task_index ? { ...t, status: 'in_progress' as const } : t,
      );
      const updated = { ...job, tasks };
      persistJob(updated);
      sendJobUpdated(updated);
      return;
    }

    if (event.type === 'subagent_spawned') {
      const tasks = job.tasks.map((t) =>
        t.index === event.task_index ? { ...t, subagentSessionId: event.session_id } : t,
      );
      const updated = { ...job, tasks };
      persistJob(updated);
      sendJobUpdated(updated);
      return;
    }

    if (event.type === 'task_completed') {
      const tasks = job.tasks.map((t) =>
        t.index === event.task_index ? { ...t, status: 'completed' as const } : t,
      );
      const updated = { ...job, tasks };
      persistJob(updated);
      sendJobUpdated(updated);
      return;
    }

    if (event.type === 'workflow_completed') {
      if (rt) rt.workflowCompletedReceived = true;
      await completeJob(jobId);
    }
  };

  const handlePermission = async (jobId: string, permission: Permission): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;

    const updated: Job = {
      ...job,
      status: 'needs_attention',
      pendingPermission: {
        permissionId: permission.id,
        sessionId: permission.sessionID,
        description: permission.title,
        permissionType: permission.type,
        pattern: permission.pattern,
      },
    };
    persistJob(updated);
    sendJobUpdated(updated);
  };

  const handleSessionIdle = async (jobId: string, sessionId: string): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;

    // Only process if it's the orchestrator session
    if (job.orchestratorSessionId !== sessionId) return;

    // Ignore if waiting for user input
    if (job.status === 'needs_attention') return;

    const rt = runtimes.get(jobId);
    // Ignore if workflow_completed was already received
    if (rt?.workflowCompletedReceived) return;

    if (job.status === 'running') {
      const allComplete = job.tasks.every((t) => t.status === 'completed');
      if (allComplete) {
        await completeJob(jobId);
      } else {
        // Unexpected idle mid-workflow — log a hint, no status change
        console.warn(`[job-manager] session.idle for job ${jobId} with incomplete tasks`);
      }
    }
  };

  const handleSessionError = async (jobId: string): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'stopped') return;

    const rt = runtimes.get(jobId);
    const log = rt?.process.getLog() ?? '';

    const updated: Job = {
      ...job,
      status: 'failed',
      errorMessage: 'The orchestrator session encountered an error.',
      completedAt: Date.now(),
    };
    teardownRuntime(jobId);
    persistJob(updated);
    persistLog(jobId, log);
    sendJobUpdated(updated);
  };

  // ---------------------------------------------------------------------------
  // Wire SSE handlers for a runtime
  // ---------------------------------------------------------------------------

  const wireClientEvents = (jobId: string, client: OpenCodeClient): void => {
    client.on('orchestratorEvent', ({ event }: { event: OrchestratorEvent }) => {
      enqueueAsync(() => handleOrchestratorEvent(jobId, event));
    });

    client.on('permission', ({ permission }: { permission: Permission }) => {
      enqueueAsync(() => handlePermission(jobId, permission));
    });

    client.on('sessionIdle', ({ sessionId }: { sessionId: string }) => {
      enqueueAsync(() => handleSessionIdle(jobId, sessionId));
    });

    client.on('sessionError', () => {
      enqueueAsync(() => handleSessionError(jobId));
    });

    client.on('sseEvent', ({ event }: { event: unknown }) => {
      mainWindow.webContents.send('sse:event', { jobId, event });
    });
  };

  // ---------------------------------------------------------------------------
  // Crash handling
  // ---------------------------------------------------------------------------

  const markJobFailed = async (jobId: string, reason: string, log: string): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'stopped') return;

    const updated: Job = {
      ...job,
      status: 'failed',
      errorMessage: reason,
      completedAt: Date.now(),
    };
    teardownRuntime(jobId);
    persistJob(updated);
    persistLog(jobId, log);
    sendJobUpdated(updated);
  };

  const wireProcessFailedEvent = (jobId: string, process: OpenCodeProcess): void => {
    process.once('failed', ({ reason, log }: { reason: string; log: string }) => {
      markJobFailed(jobId, reason, log).catch(console.error);
    });
  };

  // ---------------------------------------------------------------------------
  // createJob
  // ---------------------------------------------------------------------------

  const createJob = async (params: JobCreateParams): Promise<Job> => {
    const config = storeGet('config');
    const jobId = crypto.randomUUID();
    const repoName = path.basename(params.repoPath);

    const worktreePath = getWorktreePath(config.workspaceFolder, repoName, params.branchName);

    const tasks: TaskState[] = params.workflowTasks.map((t, i) => ({
      index: i,
      name: t.name,
      status: 'pending',
      subagentSessionId: null,
    }));

    const job: Job = {
      id: jobId,
      repoName,
      repoPath: params.repoPath,
      worktreePath,
      worktreeDeleted: false,
      branchName: params.branchName,
      baseBranch: params.baseBranch,
      workflowName: params.workflowName,
      argument: params.argument,
      status: 'pending',
      port: null,
      orchestratorSessionId: null,
      tasks,
      createdAt: Date.now(),
      completedAt: null,
      archivedAt: null,
      errorMessage: null,
      pendingPermission: null,
    };

    // Step 1: Persist pending state
    persistJob(job);
    sendJobCreated(job);

    // Step 2: Create worktree
    try {
      await createWorktree({
        repoPath: params.repoPath,
        branchName: params.branchName,
        baseBranch: params.baseBranch,
        worktreePath,
        defaultCopyGlobs: config.defaultCopyGlobs,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failed: Job = { ...job, status: 'failed', errorMessage, completedAt: Date.now() };
      persistJob(failed);
      sendJobUpdated(failed);
      throw err;
    }

    // Step 3: Spawn opencode process
    const proc = new OpenCodeProcess({ jobId, worktreePath });

    await new Promise<void>((resolve, reject) => {
      proc.once('ready', async ({ port }: { port: number }) => {
        // Step 4: Create orchestrator session
        const client = new OpenCodeClient({ port });

        let orchestratorSessionId: string;
        try {
          orchestratorSessionId = await client.createSession();
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await proc.stop();
          // Attempt worktree cleanup (best effort)
          try {
            await deleteWorktree({ repoPath: params.repoPath, worktreePath });
          } catch {
            // non-fatal
          }
          client.destroy();
          const log = proc.getLog();
          const failed: Job = {
            ...job,
            status: 'failed',
            errorMessage: reason,
            completedAt: Date.now(),
          };
          persistJob(failed);
          persistLog(jobId, log);
          sendJobUpdated(failed);
          reject(new Error(reason));
          return;
        }

        // Step 5: Send workflow
        try {
          await client.sendWorkflow({
            sessionId: orchestratorSessionId,
            workflow: {
              name: params.workflowName,
              tasks: params.workflowTasks,
              source: 'builtin', // source field required by Workflow type
            },
            argument: params.argument,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await proc.stop();
          try {
            await deleteWorktree({ repoPath: params.repoPath, worktreePath });
          } catch {
            // non-fatal
          }
          client.destroy();
          const log = proc.getLog();
          const failed: Job = {
            ...job,
            status: 'failed',
            errorMessage: reason,
            completedAt: Date.now(),
          };
          persistJob(failed);
          persistLog(jobId, log);
          sendJobUpdated(failed);
          reject(new Error(reason));
          return;
        }

        // Step 6: Store runtime
        const rt: JobRuntime = { process: proc, client, workflowCompletedReceived: false };
        runtimes.set(jobId, rt);

        // Wire SSE event handlers
        wireClientEvents(jobId, client);

        // Wire process failure handler
        wireProcessFailedEvent(jobId, proc);

        // Step 7: Subscribe to SSE
        client.connectSse();

        // Step 8: Persist port + orchestratorSessionId, mark running
        const runningJob: Job = {
          ...job,
          status: 'running',
          port,
          orchestratorSessionId,
        };
        persistJob(runningJob);
        sendJobUpdated(runningJob);

        resolve();
      });

      proc.once('failed', async ({ reason, log }: { reason: string; log: string }) => {
        // Process failed before becoming healthy
        const failed: Job = {
          ...job,
          status: 'failed',
          errorMessage: reason,
          completedAt: Date.now(),
        };
        // Attempt worktree cleanup (best effort)
        try {
          await deleteWorktree({ repoPath: params.repoPath, worktreePath });
        } catch {
          // non-fatal
        }
        persistJob(failed);
        persistLog(jobId, log);
        sendJobUpdated(failed);
        reject(new Error(reason));
      });

      proc.start();
    });

    return getJob(jobId)!;
  };

  // ---------------------------------------------------------------------------
  // stopJob
  // ---------------------------------------------------------------------------

  const stopJob = async (jobId: string): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'stopped') return;

    const rt = runtimes.get(jobId);
    if (rt) {
      // Abort orchestrator session (best effort)
      if (job.orchestratorSessionId) {
        try {
          await rt.client.abortSession({ sessionId: job.orchestratorSessionId });
        } catch {
          // non-fatal
        }
      }
      // Stop the process
      await rt.process.stop();
      rt.client.destroy();
      runtimes.delete(jobId);
    }

    const updated: Job = {
      ...job,
      status: 'stopped',
      completedAt: Date.now(),
    };
    persistJob(updated);
    sendJobUpdated(updated);
  };

  // ---------------------------------------------------------------------------
  // archiveJob / unarchiveJob
  // ---------------------------------------------------------------------------

  const archiveJob = async (jobId: string): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;

    const updated: Job = { ...job, archivedAt: Date.now() };
    persistJob(updated);
    sendJobUpdated(updated);
  };

  const unarchiveJob = async (jobId: string): Promise<void> => {
    const job = getJob(jobId);
    if (!job) return;

    const updated: Job = { ...job, archivedAt: null };
    persistJob(updated);
    sendJobUpdated(updated);
  };

  // ---------------------------------------------------------------------------
  // listActive / listArchive
  // ---------------------------------------------------------------------------

  const listActive = (): Job[] => {
    const jobs = storeGet('jobs');
    return Object.values(jobs).filter((j) => j.archivedAt === null);
  };

  const listArchive = (): Job[] => {
    const jobs = storeGet('jobs');
    return Object.values(jobs).filter((j) => j.archivedAt !== null);
  };

  // ---------------------------------------------------------------------------
  // deleteWorktree / deleteWorktreeForce
  // ---------------------------------------------------------------------------

  const deleteWorktreeForJob = async (
    jobId: string,
  ): Promise<{ success: boolean; hasUncommittedChanges?: boolean; error?: string }> => {
    const job = getJob(jobId);
    if (!job) return { success: false, error: 'Job not found' };

    try {
      const result = await deleteWorktree({
        repoPath: job.repoPath,
        worktreePath: job.worktreePath,
      });
      if (result.success) {
        const updated: Job = { ...job, worktreeDeleted: true };
        persistJob(updated);
        sendJobUpdated(updated);
      }
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const deleteWorktreeForceForJob = async (
    jobId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const job = getJob(jobId);
    if (!job) return { success: false, error: 'Job not found' };

    try {
      const result = await deleteWorktreeForce({
        repoPath: job.repoPath,
        worktreePath: job.worktreePath,
      });
      if (result.success) {
        const updated: Job = { ...job, worktreeDeleted: true };
        persistJob(updated);
        sendJobUpdated(updated);
      }
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  // ---------------------------------------------------------------------------
  // getLog
  // ---------------------------------------------------------------------------

  const getLog = async (jobId: string): Promise<string> => {
    const logs = storeGet('jobLogs');
    return logs[jobId] ?? '';
  };

  // ---------------------------------------------------------------------------
  // respondPermission
  // ---------------------------------------------------------------------------

  const respondPermission = async (params: {
    jobId: string;
    permissionId: string;
    response: 'once' | 'always' | 'reject';
  }): Promise<void> => {
    const job = getJob(params.jobId);
    if (!job) return;
    if (!job.pendingPermission) return;

    const rt = runtimes.get(params.jobId);
    if (!rt) return;

    // Use the sessionID stored on the permission (may be a subagent session)
    const { sessionId } = job.pendingPermission;

    await rt.client.respondPermission({
      sessionId,
      permissionId: params.permissionId,
      response: params.response,
    });

    const updated: Job = {
      ...job,
      status: 'running',
      pendingPermission: null,
    };
    persistJob(updated);
    sendJobUpdated(updated);
  };

  // ---------------------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------------------

  const sendMessage = async (params: { jobId: string; text: string }): Promise<void> => {
    const job = getJob(params.jobId);
    if (!job || !job.orchestratorSessionId) return;

    const rt = runtimes.get(params.jobId);
    if (!rt) return;

    await rt.client.sendMessage({
      sessionId: job.orchestratorSessionId,
      text: params.text,
    });
  };

  // ---------------------------------------------------------------------------
  // getSessionMessages
  // ---------------------------------------------------------------------------

  const getSessionMessages = async (params: {
    jobId: string;
    sessionId: string;
  }): Promise<SessionMessage[]> => {
    const rt = runtimes.get(params.jobId);
    if (!rt) return [];

    return rt.client.fetchMessages({ sessionId: params.sessionId });
  };

  // ---------------------------------------------------------------------------
  // restoreOnStartup
  // ---------------------------------------------------------------------------

  const restoreOnStartup = async (): Promise<void> => {
    const jobs = storeGet('jobs');
    const nonTerminalStatuses: JobStatus[] = ['pending', 'running', 'needs_attention'];

    for (const job of Object.values(jobs)) {
      if (nonTerminalStatuses.includes(job.status)) {
        const updated: Job = {
          ...job,
          status: 'failed',
          errorMessage: 'App was restarted while this job was active.',
          completedAt: Date.now(),
        };
        persistJob(updated);
        sendJobUpdated(updated);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    restoreOnStartup,
    createJob,
    stopJob,
    archiveJob,
    unarchiveJob,
    listActive,
    listArchive,
    deleteWorktree: deleteWorktreeForJob,
    deleteWorktreeForce: deleteWorktreeForceForJob,
    getLog,
    respondPermission,
    sendMessage,
    getSessionMessages,
  };
};

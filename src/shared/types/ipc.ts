import { z } from 'zod';

import type { Job, JobCreateParams } from './job.ts';
import type { Repo } from './repo.ts';
import type { OrchestratorEvent } from './sse.ts';
import type { Config } from './store.ts';
import type { Workflow } from './workflow.ts';

// IPC session message types (text/tool_call/tool_result parts).

export const schMessagePart = z.object({
  type: z.enum(['text', 'tool_call', 'tool_result']),
  text: z.string().optional(),
});
export type MessagePart = z.infer<typeof schMessagePart>;

export const schSessionMessage = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  parts: z.array(schMessagePart),
  createdAt: z.number(),
});
export type SessionMessage = z.infer<typeof schSessionMessage>;

/**
 * ElectronAPI: window.api shape declared for renderer TypeScript.
 */
export type ElectronAPI = {
  // Invoke (renderer → main, returns Promise)
  workspace: {
    scan: () => Promise<Repo[]>;
  };
  workflow: {
    list: (repoPath: string) => Promise<Workflow[]>;
  };
  settings: {
    get: () => Promise<Config>;
    set: (partial: Partial<Config>) => Promise<void>;
  };
  binary: {
    check: () => Promise<{ found: boolean; path?: string }>;
    recheck: () => Promise<{ found: boolean; path?: string }>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  job: {
    create: (params: JobCreateParams) => Promise<Job>;
    stop: (jobId: string) => Promise<void>;
    archive: (jobId: string) => Promise<void>;
    unarchive: (jobId: string) => Promise<void>;
    listActive: () => Promise<Job[]>;
    listArchive: () => Promise<Job[]>;
    deleteWorktree: (
      jobId: string,
    ) => Promise<{ success: boolean; hasUncommittedChanges?: boolean; error?: string }>;
    deleteWorktreeForce: (jobId: string) => Promise<{ success: boolean; error?: string }>;
    getLog: (jobId: string) => Promise<string>;
  };
  permission: {
    respond: (params: {
      jobId: string;
      permissionId: string;
      response: 'once' | 'always' | 'reject';
    }) => Promise<void>;
  };
  message: {
    send: (params: { jobId: string; text: string }) => Promise<void>;
  };
  session: {
    messages: (params: { jobId: string; sessionId: string }) => Promise<SessionMessage[]>;
  };
  branch: {
    validate: (params: {
      repoPath: string;
      branchName: string;
      activeJobIds: string[];
    }) => Promise<{ valid: boolean; error?: string }>;
    preview: (params: {
      argument: string;
      workflowName: string;
      githubHandle: string;
    }) => Promise<string>;
  };
  repo: {
    listBranches: (repoPath: string) => Promise<string[]>;
  };
  onboarding: {
    isComplete: () => Promise<boolean>;
    complete: (params: { workspaceFolder: string; githubHandle: string }) => Promise<void>;
  };

  // Subscribe (main → renderer, returns unsubscribe function)
  onJobCreated: (cb: (job: Job) => void) => () => void;
  onJobUpdated: (cb: (job: Job) => void) => () => void;
  onSseEvent: (cb: (params: { jobId: string; event: unknown }) => void) => () => void;
  onSseOrchestratorEvent: (
    cb: (params: { jobId: string; event: OrchestratorEvent }) => void,
  ) => () => void;
  onBinaryStatus: (cb: (params: { found: boolean }) => void) => () => void;
  onWorkspaceUpdated: (cb: (repos: Repo[]) => void) => () => void;
  onNavigateJob: (cb: (jobId: string) => void) => () => void;
  onNavigateSettings: (cb: () => void) => () => void;

  /**
   * Dev-only helpers — available in development builds only (is.dev === true)
   */
  dev?: {
    clearStore: () => Promise<void>;
    resetAndReload: () => Promise<void>;
  };
};

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

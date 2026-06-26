import { z } from 'zod';

import { schWorkflowTask } from './workflow.ts';

// Job creation parameters.

export const schJobCreateParams = z.object({
  repoPath: z.string(),
  workflowName: z.string(),
  workflowTasks: z.array(schWorkflowTask),
  argument: z.string(),
  branchName: z.string(),
  baseBranch: z.string(),
});
export type JobCreateParams = z.infer<typeof schJobCreateParams>;

// Job lifecycle types and state machine.

export const schJobStatus = z.enum([
  'pending', // Created in store; worktree + process not yet ready
  'running', // opencode serve healthy; orchestrator active
  'needs_attention', // Waiting for user permission response
  'completed', // All tasks finished successfully
  'failed', // Fatal error (crash × 2, API error, setup failure)
  'stopped', // User manually stopped
]);
export type JobStatus = z.infer<typeof schJobStatus>;

export const schPendingPermission = z.object({
  permissionId: z.string(),
  description: z.string(), // Human-readable (from Permission.title)
  permissionType: z.string(), // e.g. 'bash', 'edit', 'webfetch'
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
});
export type PendingPermission = z.infer<typeof schPendingPermission>;

export const schTaskState = z.object({
  index: z.number().int().nonnegative(), // 0-based
  name: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  subagentSessionId: z.string().nullable(),
});
export type TaskState = z.infer<typeof schTaskState>;

export const schJob = z.object({
  id: z.string(), // 'job-<crypto.randomUUID()>'
  repoName: z.string(), // Directory basename of the repo
  repoPath: z.string(), // Absolute path to source repo
  worktreePath: z.string(), // Absolute path to worktree directory.
  // After deletion, this value is RETAINED for display/audit purposes.
  // Always check worktreeDeleted before accessing the filesystem at this path.
  worktreeDeleted: z.boolean(), // true after worktree is deleted; worktreePath still holds old path
  branchName: z.string(), // Full branch name (e.g. 'av-123/the-auth-module')
  baseBranch: z.string(), // Branch the worktree was created from
  workflowName: z.string(), // Display name of the workflow used
  argument: z.string(), // User-supplied argument text
  status: schJobStatus,
  port: z.number().nullable(), // Assigned opencode serve port
  orchestratorSessionId: z.string().nullable(),
  tasks: z.array(schTaskState),
  createdAt: z.number(), // Unix timestamp ms
  completedAt: z.number().nullable(), // Set when status becomes completed/failed/stopped
  archivedAt: z.number().nullable(), // null = on Dashboard; set when user archives or job completes
  errorMessage: z.string().nullable(), // Last error (for failed jobs)
  pendingPermission: schPendingPermission.nullable(),
  // Note: no pendingQuestion field — free-text input is always available while running
});
export type Job = z.infer<typeof schJob>;

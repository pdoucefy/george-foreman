import { z } from 'zod';

import { schJob } from './job.ts';

// electron-store schema: typed config, jobs, and job logs.

export const schWindowBounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type WindowBounds = z.infer<typeof schWindowBounds>;

export const schConfig = z.object({
  workspaceFolder: z.string(),
  githubHandle: z.string(),
  userWorkflowsFolder: z.string().nullable(),
  defaultCopyGlobs: z.string(), // Newline-separated glob patterns
  windowBounds: schWindowBounds.nullable(),
});
export type Config = z.infer<typeof schConfig>;

export const schStore = z.object({
  schemaVersion: z.literal(1),
  config: schConfig,
  jobs: z.record(schJob), // keyed by jobId
  jobLogs: z.record(z.string()), // keyed by jobId — accumulated stdout+stderr
});
export type StoreSchema = z.infer<typeof schStore>;

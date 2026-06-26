import { z } from 'zod';

// Repo: a git repository discovered in the workspace folder.

export const schRepo = z.object({
  name: z.string(), // directory basename
  path: z.string(), // absolute path
  defaultBranch: z.string(), // e.g. "main"
});

export type Repo = z.infer<typeof schRepo>;

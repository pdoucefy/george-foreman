import { z } from 'zod';

// §9 — Workflow System

export const schWorkflowSource = z.enum(['repo', 'user', 'builtin']);
export type WorkflowSource = z.infer<typeof schWorkflowSource>;

export const schWorkflowArgument = z.enum(['required', 'optional', 'none']);
export type WorkflowArgument = z.infer<typeof schWorkflowArgument>;

export const schWorkflowTask = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
});
export type WorkflowTask = z.infer<typeof schWorkflowTask>;

export const schWorkflow = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // argument is optional in YAML; workflow-loader.ts auto-detects if omitted:
  // 'required' if any prompt contains {{argument}}, otherwise 'none'
  argument: schWorkflowArgument.optional(),
  tasks: z.array(schWorkflowTask).min(1),
  source: schWorkflowSource, // required — derived at load time, not in YAML
});
export type Workflow = z.infer<typeof schWorkflow>;

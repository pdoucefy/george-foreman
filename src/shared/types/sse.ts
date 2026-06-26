import { z } from 'zod';

// SSE and Orchestrator Protocol types (OpenCode wire format).

// SSE GlobalEvent wrapper (platform events from OpenCode server)
// Uses z.union (not discriminatedUnion) because the catch-all variant uses z.string(),
// which is not a literal and therefore incompatible with discriminatedUnion in zod 3.
export const schGlobalEvent = z.object({
  directory: z.string(), // project directory path
  payload: z.union([
    z.object({ type: z.literal('permission.updated'), properties: z.unknown() }),
    z.object({ type: z.literal('session.idle'), properties: z.unknown() }),
    z.object({ type: z.literal('session.error'), properties: z.unknown() }),
    z.object({ type: z.string(), properties: z.unknown() }),
  ]),
});
export type GlobalEvent = z.infer<typeof schGlobalEvent>;

// Permission shape (payload.properties for permission.updated events)
export const schPermission = z.object({
  id: z.string(), // permissionId — use for POST /permissions/:permissionID
  type: z.string(), // e.g. 'bash', 'edit', 'webfetch', 'doom_loop'
  pattern: z.union([z.string(), z.array(z.string())]).optional(),
  sessionID: z.string(), // session that triggered the permission
  messageID: z.string(),
  callID: z.string().optional(), // tool call that triggered this
  title: z.string(), // human-readable description — display this to user
  metadata: z.record(z.unknown()),
  time: z.object({ created: z.number() }), // unix epoch ms
});
export type Permission = z.infer<typeof schPermission>;

// Structured orchestrator events (emitted as JSON lines in message text)
// task_index and session_id use snake_case to match the OpenCode wire protocol exactly.
export const schOrchestratorEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task_started'),
    task_index: z.number().int().nonnegative(),
    session_id: z.string(),
  }),
  z.object({
    type: z.literal('subagent_spawned'),
    task_index: z.number().int().nonnegative(),
    session_id: z.string(),
  }),
  z.object({ type: z.literal('task_completed'), task_index: z.number().int().nonnegative() }),
  z.object({ type: z.literal('workflow_completed') }),
]);
export type OrchestratorEvent = z.infer<typeof schOrchestratorEvent>;

// session.idle event shape
export const schEventSessionIdle = z.object({
  type: z.literal('session.idle'),
  properties: z.object({ sessionID: z.string() }),
});
export type EventSessionIdle = z.infer<typeof schEventSessionIdle>;

// session.error event shape
export const schEventSessionError = z.object({
  type: z.literal('session.error'),
  properties: z.record(z.unknown()), // shape not fully documented; parse defensively
});
export type EventSessionError = z.infer<typeof schEventSessionError>;

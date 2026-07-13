import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrchestratorEvent, Permission } from '../../shared/types/sse.ts';
import type { Workflow } from '../../shared/types/workflow.ts';
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  OpenCodeClient,
  buildWorkflowMessage,
  createSseParser,
} from '../opencode.ts';
import type { Requester, SseRequester } from '../opencode.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeWorkflow = (overrides?: Partial<Workflow>): Workflow => ({
  name: 'Test Workflow',
  description: 'A test workflow',
  argument: 'required',
  source: 'builtin',
  tasks: [
    { name: 'Task One', prompt: 'Do something with {{argument}}' },
    { name: 'Task Two', prompt: 'Do another thing' },
  ],
  ...overrides,
});

// ---------------------------------------------------------------------------
// createSseParser
// ---------------------------------------------------------------------------

describe('createSseParser', () => {
  it('parses a complete SSE event in one chunk', () => {
    const parser = createSseParser();
    const msgs = parser.onChunk(Buffer.from('data: {"hello":"world"}\n\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.data).toBe('{"hello":"world"}');
  });

  it('handles partial chunks — event split across two chunks', () => {
    const parser = createSseParser();
    const msgs1 = parser.onChunk(Buffer.from('data: hel'));
    expect(msgs1).toHaveLength(0);
    const msgs2 = parser.onChunk(Buffer.from('lo\n\n'));
    expect(msgs2).toHaveLength(1);
    expect(msgs2[0]!.data).toBe('hello');
  });

  it('parses multiple events from one chunk', () => {
    const parser = createSseParser();
    const msgs = parser.onChunk(Buffer.from('data: first\n\ndata: second\n\n'));
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.data).toBe('first');
    expect(msgs[1]!.data).toBe('second');
  });

  it('parses event: field', () => {
    const parser = createSseParser();
    const msgs = parser.onChunk(Buffer.from('event: ping\ndata: {}\n\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.event).toBe('ping');
    expect(msgs[0]!.data).toBe('{}');
  });

  it('joins multiple data: lines with newline', () => {
    const parser = createSseParser();
    const msgs = parser.onChunk(Buffer.from('data: line1\ndata: line2\n\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.data).toBe('line1\nline2');
  });

  it('ignores blank blocks', () => {
    const parser = createSseParser();
    const msgs = parser.onChunk(Buffer.from('\n\ndata: hello\n\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.data).toBe('hello');
  });

  it('handles chunk split exactly at \\n\\n boundary', () => {
    const parser = createSseParser();
    const msgs1 = parser.onChunk(Buffer.from('data: hello\n'));
    expect(msgs1).toHaveLength(0);
    const msgs2 = parser.onChunk(Buffer.from('\n'));
    expect(msgs2).toHaveLength(1);
    expect(msgs2[0]!.data).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// buildWorkflowMessage
// ---------------------------------------------------------------------------

describe('buildWorkflowMessage', () => {
  it('replaces {{argument}} in task prompts', () => {
    const wf = makeWorkflow();
    const msg = buildWorkflowMessage(wf, 'my-arg');
    expect(msg).toContain('my-arg');
    expect(msg).not.toContain('{{argument}}');
  });

  it('numbers tasks starting at 1', () => {
    const wf = makeWorkflow();
    const msg = buildWorkflowMessage(wf, 'x');
    expect(msg).toContain('1. Task One');
    expect(msg).toContain('2. Task Two');
  });

  it('includes the argument at the top', () => {
    const wf = makeWorkflow();
    const msg = buildWorkflowMessage(wf, 'hello world');
    expect(msg).toMatch(/Execute the following workflow\. Argument: "hello world"/);
  });

  it('replaces multiple {{argument}} occurrences', () => {
    const wf = makeWorkflow({
      tasks: [{ name: 'T', prompt: '{{argument}} and {{argument}}' }],
    });
    const msg = buildWorkflowMessage(wf, 'X');
    expect(msg).toContain('X and X');
    expect(msg).not.toContain('{{argument}}');
  });
});

// ---------------------------------------------------------------------------
// ORCHESTRATOR_SYSTEM_PROMPT
// ---------------------------------------------------------------------------

describe('ORCHESTRATOR_SYSTEM_PROMPT', () => {
  it('contains required JSON block templates', () => {
    expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('"type":"task_started"');
    expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('"type":"subagent_spawned"');
    expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('"type":"task_completed"');
    expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('"type":"workflow_completed"');
  });
});

// ---------------------------------------------------------------------------
// Helpers for building fake Requester / SseRequester
// ---------------------------------------------------------------------------

const makeRequester = (responses: Array<{ status: number; body: string } | Error>): Requester => {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error('No more mock responses');
    if (r instanceof Error) throw r;
    return r;
  });
};

/** Fake SSE requester that never calls back (connection stays open). */
const makeSilentSseRequester = (): SseRequester => vi.fn(() => ({ destroy: vi.fn() }));

const makeClient = (
  requester: Requester,
  sseRequester: SseRequester = makeSilentSseRequester(),
): OpenCodeClient => new OpenCodeClient({ port: 9999, requester, sseRequester });

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('OpenCodeClient.createSession', () => {
  it('returns the session ID from /session response', async () => {
    const req = makeRequester([{ status: 200, body: '{"id":"sess-123"}' }]);
    const client = makeClient(req);
    const id = await client.createSession();
    expect(id).toBe('sess-123');
  });

  it('throws if response is missing id', async () => {
    const req = makeRequester([{ status: 200, body: '{"nope":"x"}' }]);
    const client = makeClient(req);
    await expect(client.createSession()).rejects.toThrow('Unexpected /session response');
  });
});

// ---------------------------------------------------------------------------
// sendWorkflow
// ---------------------------------------------------------------------------

describe('OpenCodeClient.sendWorkflow', () => {
  it('POSTs to /session/:id/prompt_async with correct body', async () => {
    const req = makeRequester([{ status: 204, body: '' }]);
    const client = makeClient(req);
    const wf = makeWorkflow();
    await client.sendWorkflow({ sessionId: 'sess-1', workflow: wf, argument: 'hello' });
    expect(req).toHaveBeenCalledOnce();
    const call = (req as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { method: string; body?: string },
    ];
    expect(call[0]).toContain('/session/sess-1/prompt_async');
    const body = JSON.parse(call[1].body!) as {
      system: string;
      parts: Array<{ type: string; text: string }>;
    };
    expect(body.system).toBe(ORCHESTRATOR_SYSTEM_PROMPT);
    expect(body.parts[0]!.text).toContain('hello');
  });
});

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

describe('OpenCodeClient.sendMessage', () => {
  it('POSTs text parts to /session/:id/prompt_async', async () => {
    const req = makeRequester([{ status: 204, body: '' }]);
    const client = makeClient(req);
    await client.sendMessage({ sessionId: 'sess-1', text: 'Hi there' });
    const call = (req as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body?: string }];
    const body = JSON.parse(call[1].body!) as { parts: Array<{ type: string; text: string }> };
    expect(body.parts[0]!.text).toBe('Hi there');
  });
});

// ---------------------------------------------------------------------------
// respondPermission
// ---------------------------------------------------------------------------

describe('OpenCodeClient.respondPermission', () => {
  it.each([['once' as const], ['always' as const], ['reject' as const]])(
    'sends response=%s to the correct endpoint',
    async (response) => {
      const req = makeRequester([{ status: 200, body: '{}' }]);
      const client = makeClient(req);
      await client.respondPermission({ sessionId: 'sess-1', permissionId: 'perm-1', response });
      const call = (req as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body?: string }];
      expect(call[0]).toContain('/session/sess-1/permissions/perm-1');
      const body = JSON.parse(call[1].body!) as { response: string };
      expect(body.response).toBe(response);
    },
  );
});

// ---------------------------------------------------------------------------
// fetchMessages
// ---------------------------------------------------------------------------

describe('OpenCodeClient.fetchMessages', () => {
  it('returns validated SessionMessage array', async () => {
    const messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }], createdAt: 1000 },
    ];
    const req = makeRequester([{ status: 200, body: JSON.stringify(messages) }]);
    const client = makeClient(req);
    const result = await client.fetchMessages({ sessionId: 'sess-1' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('m1');
  });

  it('throws if response is not an array', async () => {
    const req = makeRequester([{ status: 200, body: '{"not":"array"}' }]);
    const client = makeClient(req);
    await expect(client.fetchMessages({ sessionId: 'sess-1' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// abortSession
// ---------------------------------------------------------------------------

describe('OpenCodeClient.abortSession', () => {
  it('POSTs to /session/:id/abort', async () => {
    const req = makeRequester([{ status: 200, body: '{}' }]);
    const client = makeClient(req);
    await client.abortSession({ sessionId: 'sess-1' });
    const call = (req as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    expect(call[0]).toContain('/session/sess-1/abort');
  });
});

// ---------------------------------------------------------------------------
// getSessionStatus
// ---------------------------------------------------------------------------

describe('OpenCodeClient.getSessionStatus', () => {
  it('GETs /session/status and returns parsed JSON', async () => {
    const req = makeRequester([{ status: 200, body: '{"status":"ok"}' }]);
    const client = makeClient(req);
    const result = await client.getSessionStatus();
    expect(result).toEqual({ status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

describe('retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries network errors up to 3 times total', async () => {
    const networkErr = new Error('ECONNREFUSED');
    const req = makeRequester([networkErr, networkErr, { status: 200, body: '{"id":"s1"}' }]);
    const client = makeClient(req);
    const promise = client.createSession();
    // Advance timers for the two retry delays
    await vi.runAllTimersAsync();
    const id = await promise;
    expect(id).toBe('s1');
    expect(req).toHaveBeenCalledTimes(3);
  });

  it('throws after 3 consecutive network errors', async () => {
    const networkErr = new Error('ECONNREFUSED');
    const req = makeRequester([networkErr, networkErr, networkErr]);
    const client = makeClient(req);
    // Attach rejection handler immediately to avoid unhandled rejection warning
    const promise = client.createSession().catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('ECONNREFUSED');
    expect(req).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-2xx HTTP errors', async () => {
    const req = makeRequester([{ status: 500, body: 'Server Error' }]);
    const client = makeClient(req);
    await expect(client.createSession()).rejects.toThrow('HTTP 500');
    expect(req).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SSE Pipeline 1 — routing
// ---------------------------------------------------------------------------

describe('SSE Pipeline 1', () => {
  // No fake timers — these tests use real timers to avoid infinite reconnect loops.
  // We call client.destroy() after assertions to prevent reconnect scheduling.

  const globalEventData = (payload: unknown): string =>
    JSON.stringify({ directory: '/tmp', payload });

  /**
   * SSE requester that delivers chunks synchronously (no setImmediate) so
   * there is no timer interaction. Does NOT call onEnd — client.destroy() is
   * called after assertions to clean up.
   */
  const makeChunkSseRequester = (chunks: Buffer[]): SseRequester =>
    vi.fn((_url, onChunk) => {
      for (const c of chunks) onChunk(c);
      return { destroy: vi.fn() };
    });

  it('emits permission event for permission.updated', () => {
    const perm: Permission = {
      id: 'perm-1',
      type: 'bash',
      sessionID: 'sess-1',
      messageID: 'msg-1',
      title: 'Run bash',
      metadata: {},
      time: { created: 1000 },
    };
    const data = globalEventData({ type: 'permission.updated', properties: perm });
    const sse = makeChunkSseRequester([Buffer.from(`data: ${data}\n\n`)]);
    const req = makeRequester([]);
    const client = new OpenCodeClient({ port: 9999, requester: req, sseRequester: sse });

    const emitted: Permission[] = [];
    client.on('permission', ({ permission }) => emitted.push(permission));

    client.connectSse();
    client.destroy();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.id).toBe('perm-1');
  });

  it('emits sessionIdle for session.idle', () => {
    const data = globalEventData({ type: 'session.idle', properties: { sessionID: 'sess-42' } });
    const sse = makeChunkSseRequester([Buffer.from(`data: ${data}\n\n`)]);
    const client = new OpenCodeClient({
      port: 9999,
      requester: makeRequester([]),
      sseRequester: sse,
    });

    const emitted: string[] = [];
    client.on('sessionIdle', ({ sessionId }) => emitted.push(sessionId));

    client.connectSse();
    client.destroy();

    expect(emitted).toEqual(['sess-42']);
  });

  it('emits sessionError for session.error', () => {
    const data = globalEventData({ type: 'session.error', properties: { message: 'boom' } });
    const sse = makeChunkSseRequester([Buffer.from(`data: ${data}\n\n`)]);
    const client = new OpenCodeClient({
      port: 9999,
      requester: makeRequester([]),
      sseRequester: sse,
    });

    const emitted: Record<string, unknown>[] = [];
    client.on('sessionError', ({ properties }) => emitted.push(properties));

    client.connectSse();
    client.destroy();

    expect(emitted).toHaveLength(1);
  });

  it('emits sseEvent for unknown types', () => {
    const data = globalEventData({ type: 'some.other.event', properties: {} });
    const sse = makeChunkSseRequester([Buffer.from(`data: ${data}\n\n`)]);
    const client = new OpenCodeClient({
      port: 9999,
      requester: makeRequester([]),
      sseRequester: sse,
    });

    const emitted: unknown[] = [];
    client.on('sseEvent', ({ event }) => emitted.push(event));

    client.connectSse();
    client.destroy();

    expect(emitted).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SSE Pipeline 2 — orchestrator JSON line stripping
// ---------------------------------------------------------------------------

describe('SSE Pipeline 2', () => {
  const makeChunkSseRequester = (chunks: Buffer[]): SseRequester =>
    vi.fn((_url, onChunk) => {
      for (const c of chunks) onChunk(c);
      return { destroy: vi.fn() };
    });

  it('emits orchestratorEvent and strips JSON line from sseEvent', () => {
    // eslint-disable-next-line camelcase
    const orchLine: OrchestratorEvent = { type: 'task_started', task_index: 0, session_id: 's' };
    const textDelta = `Starting...\n${JSON.stringify(orchLine)}\nSome chat`;
    const payload = {
      type: 'message.part.updated',
      properties: { part: { type: 'text', text: textDelta } },
    };
    const data = JSON.stringify({ directory: '/tmp', payload });
    const sse = makeChunkSseRequester([Buffer.from(`data: ${data}\n\n`)]);
    const client = new OpenCodeClient({
      port: 9999,
      requester: makeRequester([]),
      sseRequester: sse,
    });

    const orchEvents: OrchestratorEvent[] = [];
    const sseEvents: unknown[] = [];
    client.on('orchestratorEvent', ({ event }) => orchEvents.push(event));
    client.on('sseEvent', ({ event }) => sseEvents.push(event));

    client.connectSse();
    client.destroy();

    expect(orchEvents).toHaveLength(1);
    expect(orchEvents[0]!.type).toBe('task_started');

    expect(sseEvents).toHaveLength(1);
    const sseEvent = sseEvents[0] as { payload: { properties: { part: { text: string } } } };
    expect(sseEvent.payload.properties.part.text).not.toContain('"task_started"');
    expect(sseEvent.payload.properties.part.text).toContain('Starting...');
    expect(sseEvent.payload.properties.part.text).toContain('Some chat');
  });

  it('keeps non-JSON lines in sseEvent', () => {
    const textDelta = 'Just plain text\nNo JSON here';
    const payload = {
      type: 'message.part.updated',
      properties: { part: { type: 'text', text: textDelta } },
    };
    const data = JSON.stringify({ directory: '/tmp', payload });
    const sse = makeChunkSseRequester([Buffer.from(`data: ${data}\n\n`)]);
    const client = new OpenCodeClient({
      port: 9999,
      requester: makeRequester([]),
      sseRequester: sse,
    });

    const orchEvents: unknown[] = [];
    const sseEvents: unknown[] = [];
    client.on('orchestratorEvent', (e) => orchEvents.push(e));
    client.on('sseEvent', ({ event }) => sseEvents.push(event));

    client.connectSse();
    client.destroy();

    expect(orchEvents).toHaveLength(0);
    expect(sseEvents).toHaveLength(1);
    const sseEvent = sseEvents[0] as { payload: { properties: { part: { text: string } } } };
    expect(sseEvent.payload.properties.part.text).toBe(textDelta);
  });

  it('strips all known orchestrator types', () => {
    const lines: OrchestratorEvent[] = [
      // eslint-disable-next-line camelcase
      { type: 'task_started', task_index: 0, session_id: 's' },
      // eslint-disable-next-line camelcase
      { type: 'subagent_spawned', task_index: 0, session_id: 's2' },
      // eslint-disable-next-line camelcase
      { type: 'task_completed', task_index: 0 },
      { type: 'workflow_completed' },
    ];
    const textDelta = lines.map((l) => JSON.stringify(l)).join('\n');
    const payload = {
      type: 'message.part.updated',
      properties: { part: { type: 'text', text: textDelta } },
    };
    const data = JSON.stringify({ directory: '/tmp', payload });
    const sse = makeChunkSseRequester([Buffer.from(`data: ${data}\n\n`)]);
    const client = new OpenCodeClient({
      port: 9999,
      requester: makeRequester([]),
      sseRequester: sse,
    });

    const orchEvents: OrchestratorEvent[] = [];
    client.on('orchestratorEvent', ({ event }) => orchEvents.push(event));
    client.connectSse();
    client.destroy();

    expect(orchEvents.map((e) => e.type)).toEqual([
      'task_started',
      'subagent_spawned',
      'task_completed',
      'workflow_completed',
    ]);
  });
});

// ---------------------------------------------------------------------------
// SSE reconnect + generation guard
// ---------------------------------------------------------------------------

describe('SSE reconnect', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reconnects after onEnd with exponential backoff', async () => {
    // Call onEnd synchronously so there's no setImmediate under fake timers
    const sseRequester = vi.fn((_url: string, _onChunk: unknown, onEnd: () => void) => {
      onEnd();
      return { destroy: vi.fn() };
    }) as unknown as SseRequester;

    const client = new OpenCodeClient({ port: 9999, requester: makeRequester([]), sseRequester });
    client.connectSse();

    // First connection was called synchronously
    expect(sseRequester).toHaveBeenCalledTimes(1);

    // After backoff delay (1s for attempt 0), second connection
    await vi.advanceTimersByTimeAsync(1000);
    expect(sseRequester).toHaveBeenCalledTimes(2);

    // After 2s (attempt 1), third connection
    await vi.advanceTimersByTimeAsync(2000);
    expect(sseRequester).toHaveBeenCalledTimes(3);

    client.destroy();
  });

  it('destroy() stops reconnect — no further connections after destroy', async () => {
    let endCallback: (() => void) | null = null;
    const sseRequester = vi.fn((_url: string, _onChunk: unknown, onEnd: () => void) => {
      endCallback = onEnd;
      return { destroy: vi.fn() };
    }) as unknown as SseRequester;

    const client = new OpenCodeClient({ port: 9999, requester: makeRequester([]), sseRequester });
    client.connectSse();

    // Trigger disconnect then immediately destroy
    endCallback!();
    client.destroy();

    // Advance timers — no reconnect should happen
    await vi.advanceTimersByTimeAsync(5000);
    expect(sseRequester).toHaveBeenCalledTimes(1);
  });

  it('no events emitted after destroy()', () => {
    // Deliver chunks synchronously
    const sseRequester = vi.fn((_url: string, onChunk: (c: Buffer) => void) => {
      const data = JSON.stringify({
        directory: '/tmp',
        payload: { type: 'session.idle', properties: { sessionID: 'x' } },
      });
      onChunk(Buffer.from(`data: ${data}\n\n`));
      return { destroy: vi.fn() };
    }) as unknown as SseRequester;

    const client = new OpenCodeClient({ port: 9999, requester: makeRequester([]), sseRequester });
    client.destroy();
    client.connectSse(); // should be no-op after destroy

    const emitted: unknown[] = [];
    client.on('sessionIdle', (e) => emitted.push(e));

    expect(emitted).toHaveLength(0);
  });
});

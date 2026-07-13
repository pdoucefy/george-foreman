import { EventEmitter } from 'node:events';
import http from 'node:http';

import type { SessionMessage } from '../shared/types/ipc.ts';
import { schSessionMessage } from '../shared/types/ipc.ts';
import {
  schEventSessionError,
  schEventSessionIdle,
  schGlobalEvent,
  schOrchestratorEvent,
  schPermission,
} from '../shared/types/sse.ts';
import type { OrchestratorEvent, Permission } from '../shared/types/sse.ts';
import type { Workflow } from '../shared/types/workflow.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed SSE message (one event). */
export type SseMessage = {
  event?: string;
  data: string;
};

/**
 * A function that performs an HTTP request and returns status + body.
 * Typed structurally so tests can inject a fake.
 */
export type Requester = (
  url: string,
  options: { method: string; body?: string; headers?: Record<string, string> },
) => Promise<{ status: number; body: string }>;

/**
 * A function that opens an SSE (streaming HTTP GET) connection.
 * Typed structurally so tests can inject a fake.
 * Returns a handle with a `destroy()` method to cancel the request.
 */
export type SseRequester = (
  url: string,
  onChunk: (chunk: Buffer) => void,
  onEnd: () => void,
  onError: (err: Error) => void,
) => { destroy: () => void };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 500;
const SSE_RECONNECT_MAX_MS = 30_000;

export const ORCHESTRATOR_SYSTEM_PROMPT = `You are an orchestrator agent for George Foreman, an AI workflow automation system.
You will receive a workflow consisting of named tasks. Execute each task sequentially
by spawning a subagent for each one. Wait for each subagent to complete before
starting the next task.

For each task, spawn a subagent using the appropriate tool, passing it the task's
prompt verbatim. After each subagent completes, assess whether the task succeeded
before proceeding to the next task.

CRITICAL — Structured events:
You MUST emit the following JSON blocks at the exact moments described. Each block
MUST appear on its own dedicated line with NO other text on that line. This is
required for machine parsing by the host application.

When you begin a task (before spawning its subagent):
{"type":"task_started","task_index":<N>,"session_id":"<your own session ID>"}

When you spawn a subagent for a task:
{"type":"subagent_spawned","task_index":<N>,"session_id":"<the subagent session ID>"}

When a task's subagent completes successfully:
{"type":"task_completed","task_index":<N>}

When all tasks are done:
{"type":"workflow_completed"}

Rules:
- task_index is 0-based (first task = index 0)
- Each JSON block must be the only content on its line
- Do not wrap JSON blocks in code fences or add any text before/after on the same line
- Emit task_started BEFORE spawning the subagent
- Emit subagent_spawned immediately after you have the subagent's session ID
- Emit task_completed only after the subagent has finished
- Emit workflow_completed after the last task_completed`;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Build the workflow message body sent to the orchestrator as the initial prompt.
 * Replaces `{{argument}}` in task prompts with the provided argument.
 */
export const buildWorkflowMessage = (workflow: Workflow, argument: string): string => {
  const taskLines = workflow.tasks
    .map((task, i) => {
      const prompt = task.prompt.replace(/\{\{argument\}\}/g, argument);
      return `${i + 1}. ${task.name}\n   ${prompt.split('\n').join('\n   ')}`;
    })
    .join('\n\n');

  return `Execute the following workflow. Argument: "${argument}"\n\nTasks:\n${taskLines}`;
};

/**
 * Create a stateful SSE parser. Call `onChunk` with each incoming Buffer;
 * it returns an array of complete `SseMessage` objects parsed from the
 * accumulated data. Handles partial chunks (TCP fragmentation).
 */
export const createSseParser = (): { onChunk: (chunk: Buffer) => SseMessage[] } => {
  let buf = '';

  return {
    onChunk: (chunk: Buffer): SseMessage[] => {
      buf += chunk.toString('utf8');
      const messages: SseMessage[] = [];

      // SSE events are separated by blank lines (\n\n or \r\n\r\n)
      const eventBlocks = buf.split(/\n\n|\r\n\r\n/);
      // Last element is either empty (complete event) or a partial block
      buf = eventBlocks.pop() ?? '';

      for (const block of eventBlocks) {
        if (block.trim() === '') {
          // skip empty blocks (blank lines between events)
        } else {
          let event: string | undefined;
          const dataLines: string[] = [];

          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith('event:')) {
              event = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart());
            }
            // id: and retry: fields are ignored
          }

          if (dataLines.length > 0) {
            messages.push({ event, data: dataLines.join('\n') });
          }
        }
      }

      return messages;
    },
  };
};

// ---------------------------------------------------------------------------
// Default HTTP implementations
// ---------------------------------------------------------------------------

const defaultRequester: Requester = (url, options) =>
  new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer | string) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });

const defaultSseRequester: SseRequester = (url, onChunk, onEnd, onError) => {
  const req = http.get(url, (res) => {
    res.on('data', (chunk: Buffer) => onChunk(chunk));
    res.on('end', onEnd);
    res.on('error', (err: Error) => onError(err));
  });
  req.on('error', (err: Error) => onError(err));
  return { destroy: () => req.destroy() };
};

// ---------------------------------------------------------------------------
// OpenCodeClient
// ---------------------------------------------------------------------------

export type OpenCodeClientEvents = {
  /** Raw GlobalEvent forwarded from Pipeline 1 (orchestrator JSON lines stripped from message.part.updated) */
  sseEvent: [{ event: unknown }];
  /** Parsed OrchestratorEvent from Pipeline 2 */
  orchestratorEvent: [{ event: OrchestratorEvent }];
  /** session.idle — job-manager decides if it's the orchestrator session */
  sessionIdle: [{ sessionId: string }];
  /** session.error */
  sessionError: [{ properties: Record<string, unknown> }];
  /** permission.updated — validated through schPermission */
  permission: [{ permission: Permission }];
};

/**
 * HTTP API client for a single OpenCode server instance (one per job).
 *
 * Emits:
 *   - 'sseEvent'          — raw GlobalEvent (stripped of orchestrator JSON lines)
 *   - 'orchestratorEvent' — parsed OrchestratorEvent (Pipeline 2)
 *   - 'sessionIdle'       — { sessionId }
 *   - 'sessionError'      — { properties }
 *   - 'permission'        — { permission }
 */
export class OpenCodeClient extends EventEmitter {
  private readonly _baseUrl: string;
  private readonly _requester: Requester;
  private readonly _sseRequester: SseRequester;

  /**
   * Monotonically-increasing generation counter.
   * Incremented on destroy() and each SSE reconnect to guard stale closures.
   */
  private _generation = 0;
  private _destroyed = false;
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _activeSseHandle: { destroy: () => void } | null = null;

  constructor(params: { port: number; requester?: Requester; sseRequester?: SseRequester }) {
    super();
    this._baseUrl = `http://127.0.0.1:${params.port}`;
    this._requester = params.requester ?? defaultRequester;
    this._sseRequester = params.sseRequester ?? defaultSseRequester;
  }

  // ---------------------------------------------------------------------------
  // Public API — HTTP endpoints
  // ---------------------------------------------------------------------------

  /** POST /session — create a new orchestrator session. Returns the session ID. */
  readonly createSession = async (): Promise<string> => {
    const res = await this._request(`${this._baseUrl}/session`, { method: 'POST', body: '{}' });
    const parsed = JSON.parse(res.body) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      typeof (parsed as Record<string, unknown>)['id'] === 'string'
    ) {
      return (parsed as Record<string, unknown>)['id'] as string;
    }
    throw new Error(`Unexpected /session response: ${res.body}`);
  };

  /** POST /session/:id/prompt_async — send initial workflow message. */
  readonly sendWorkflow = async (params: {
    sessionId: string;
    workflow: Workflow;
    argument: string;
  }): Promise<void> => {
    const body = JSON.stringify({
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      parts: [{ type: 'text', text: buildWorkflowMessage(params.workflow, params.argument) }],
    });
    await this._request(`${this._baseUrl}/session/${params.sessionId}/prompt_async`, {
      method: 'POST',
      body,
    });
  };

  /** POST /session/:id/prompt_async — send a free-text message. */
  readonly sendMessage = async (params: { sessionId: string; text: string }): Promise<void> => {
    const body = JSON.stringify({
      parts: [{ type: 'text', text: params.text }],
    });
    await this._request(`${this._baseUrl}/session/${params.sessionId}/prompt_async`, {
      method: 'POST',
      body,
    });
  };

  /** POST /session/:id/permissions/:permissionID — respond to a permission request. */
  readonly respondPermission = async (params: {
    sessionId: string;
    permissionId: string;
    response: 'once' | 'always' | 'reject';
  }): Promise<void> => {
    const body = JSON.stringify({ response: params.response });
    await this._request(
      `${this._baseUrl}/session/${params.sessionId}/permissions/${params.permissionId}`,
      { method: 'POST', body },
    );
  };

  /** GET /session/:id/message — fetch subagent message history. */
  readonly fetchMessages = async (params: { sessionId: string }): Promise<SessionMessage[]> => {
    const res = await this._request(`${this._baseUrl}/session/${params.sessionId}/message`, {
      method: 'GET',
    });
    const parsed = JSON.parse(res.body) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`Unexpected /session/message response: ${res.body}`);
    }
    return parsed.map((item) => schSessionMessage.parse(item));
  };

  /** POST /session/:id/abort — abort a session. */
  readonly abortSession = async (params: { sessionId: string }): Promise<void> => {
    await this._request(`${this._baseUrl}/session/${params.sessionId}/abort`, {
      method: 'POST',
      body: '{}',
    });
  };

  /** GET /session/status — single status poll (used on SSE reconnect). */
  readonly getSessionStatus = async (): Promise<unknown> => {
    const res = await this._request(`${this._baseUrl}/session/status`, { method: 'GET' });
    return JSON.parse(res.body) as unknown;
  };

  // ---------------------------------------------------------------------------
  // SSE
  // ---------------------------------------------------------------------------

  /** Open the SSE connection. Reconnects automatically with exponential backoff. */
  readonly connectSse = (): void => {
    if (this._destroyed) return;
    this._generation += 1;
    this._reconnectAttempts = 0;
    this._openSse(this._generation);
  };

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Destroy this client. Cancels pending SSE connection and reconnect timers.
   * No events are emitted after destroy().
   */
  readonly destroy = (): void => {
    this._destroyed = true;
    this._generation += 1; // stale all closures
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._activeSseHandle?.destroy();
    this._activeSseHandle = null;
  };

  // ---------------------------------------------------------------------------
  // Internal: HTTP with retry
  // ---------------------------------------------------------------------------

  private async _request(
    url: string,
    options: { method: string; body?: string; headers?: Record<string, string> },
    attempt = 0,
  ): Promise<{ status: number; body: string }> {
    try {
      const res = await this._requester(url, options);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status}: ${res.body}`);
      }
      return res;
    } catch (err) {
      const isNetworkError =
        err instanceof Error &&
        (err.message.includes('ECONNREFUSED') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('socket hang up') ||
          !err.message.startsWith('HTTP '));

      if (isNetworkError && attempt < RETRY_COUNT - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return this._request(url, options, attempt + 1);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: SSE connection + pipelines
  // ---------------------------------------------------------------------------

  private _openSse(myGeneration: number): void {
    if (this._destroyed || myGeneration !== this._generation) return;

    const parser = createSseParser();

    const onChunk = (chunk: Buffer): void => {
      if (myGeneration !== this._generation) return;
      const messages = parser.onChunk(chunk);
      for (const msg of messages) {
        this._processSseMessage(msg);
      }
    };

    const onEnd = (): void => {
      if (myGeneration !== this._generation) return;
      this._scheduleReconnect(myGeneration);
    };

    const onError = (_err: Error): void => {
      if (myGeneration !== this._generation) return;
      this._scheduleReconnect(myGeneration);
    };

    this._activeSseHandle = this._sseRequester(`${this._baseUrl}/event`, onChunk, onEnd, onError);
  }

  private _scheduleReconnect(myGeneration: number): void {
    if (this._destroyed || myGeneration !== this._generation) return;

    // Increment generation so the current connection's closures go stale
    this._generation += 1;
    const newGeneration = this._generation;

    const delayMs = Math.min(1000 * Math.pow(2, this._reconnectAttempts), SSE_RECONNECT_MAX_MS);
    this._reconnectAttempts += 1;

    this._reconnectTimer = setTimeout(() => {
      if (this._destroyed || newGeneration !== this._generation) return;
      this._reconnectTimer = null;
      this._openSse(newGeneration);
    }, delayMs);
  }

  /** Pipeline 1: dispatch on payload.type */
  private _processSseMessage(msg: SseMessage): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.data);
    } catch {
      return; // malformed — ignore
    }

    const globalResult = schGlobalEvent.safeParse(parsed);
    if (!globalResult.success) return;

    const event = globalResult.data;
    const { type } = event.payload;

    if (type === 'permission.updated') {
      const permResult = schPermission.safeParse(event.payload.properties);
      if (permResult.success) {
        this.emit('permission', { permission: permResult.data });
      }
      return;
    }

    if (type === 'session.idle') {
      const idleResult = schEventSessionIdle.safeParse(event.payload);
      if (idleResult.success) {
        this.emit('sessionIdle', { sessionId: idleResult.data.properties.sessionID });
      }
      return;
    }

    if (type === 'session.error') {
      const errResult = schEventSessionError.safeParse(event.payload);
      if (errResult.success) {
        this.emit('sessionError', { properties: errResult.data.properties });
      }
      return;
    }

    if (type === 'message.part.updated') {
      // Pipeline 2: strip orchestrator JSON lines from text delta
      const stripped = this._processMessagePartUpdated(event);
      this.emit('sseEvent', { event: stripped });
      return;
    }

    // All other types — forward as-is
    this.emit('sseEvent', { event });
  }

  /**
   * Pipeline 2: scan the text delta of a message.part.updated event for
   * orchestrator JSON blocks. Emit orchestratorEvent for each valid one.
   * Return a copy of the event with those lines stripped from the text delta.
   */
  private _processMessagePartUpdated(event: ReturnType<typeof schGlobalEvent.parse>): unknown {
    // The payload properties shape for message.part.updated is not fully typed —
    // parse defensively.
    const props = event.payload.properties as Record<string, unknown> | null;
    if (!props) return event;

    const part = props['part'] as Record<string, unknown> | null;
    if (!part || part['type'] !== 'text') return event;

    const { text } = part as { text: unknown };
    if (typeof text !== 'string') return event;

    const lines = text.split('\n');
    const keptLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        keptLines.push(line);
      } else {
        let parsedLine: unknown;
        let parsed = false;
        try {
          parsedLine = JSON.parse(trimmed);
          parsed = true;
        } catch {
          keptLines.push(line);
        }

        if (parsed) {
          const orchResult = schOrchestratorEvent.safeParse(parsedLine);
          if (orchResult.success) {
            this.emit('orchestratorEvent', { event: orchResult.data });
            // Suppress from chat — do not add to keptLines
          } else {
            keptLines.push(line);
          }
        }
      }
    }

    // Return a deep copy with the stripped text
    const strippedText = keptLines.join('\n');
    return {
      ...event,
      payload: {
        ...event.payload,
        properties: {
          ...props,
          part: {
            ...part,
            text: strippedText,
          },
        },
      },
    };
  }
}

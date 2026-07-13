import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OrchestratorEvent } from '../../shared/types/sse.ts';
import { OpenCodeClient } from '../opencode.ts';

// ---------------------------------------------------------------------------
// Integration test: spins up a real HTTP server and exercises the full
// SSE pipeline through the real http module.
// ---------------------------------------------------------------------------

const listen = (server: http.Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Unexpected server address'));
      }
    });
  });

const close = (server: http.Server): Promise<void> =>
  new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

// ---------------------------------------------------------------------------

describe('OpenCodeClient integration', () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    server = http.createServer();
    port = await listen(server);
  });

  afterEach(async () => {
    await close(server);
  });

  it('creates a session via real HTTP', async () => {
    server.on('request', (_req, res) => {
      if (_req.method === 'POST' && _req.url === '/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'real-sess-1' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const client = new OpenCodeClient({ port });
    const id = await client.createSession();
    expect(id).toBe('real-sess-1');
    client.destroy();
  });

  it('receives SSE events and parses orchestrator JSON lines via real HTTP', async () => {
    const orchEvent: OrchestratorEvent = {
      type: 'task_started',
      // eslint-disable-next-line camelcase
      task_index: 0,
      // eslint-disable-next-line camelcase
      session_id: 'sess-x',
    };
    const textDelta = `Hello from orchestrator\n${JSON.stringify(orchEvent)}\nDone`;
    const payload = {
      type: 'message.part.updated',
      properties: { part: { type: 'text', text: textDelta } },
    };
    const sseData = JSON.stringify({ directory: '/tmp', payload });

    server.on('request', (req, res) => {
      if (req.url === '/event') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${sseData}\n\n`);
        // Keep connection open briefly then end
        setTimeout(() => res.end(), 50);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const client = new OpenCodeClient({ port });

    const orchEvents: OrchestratorEvent[] = [];
    const sseEvents: unknown[] = [];
    client.on('orchestratorEvent', ({ event }) => orchEvents.push(event));
    client.on('sseEvent', ({ event }) => sseEvents.push(event));

    client.connectSse();

    // Wait for events to arrive
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    client.destroy();

    expect(orchEvents).toHaveLength(1);
    expect(orchEvents[0]!.type).toBe('task_started');

    expect(sseEvents).toHaveLength(1);
    const ev = sseEvents[0] as { payload: { properties: { part: { text: string } } } };
    expect(ev.payload.properties.part.text).toContain('Hello from orchestrator');
    expect(ev.payload.properties.part.text).not.toContain('"task_started"');
  });

  it('retries on network errors then succeeds', async () => {
    let callCount = 0;
    const retryServer = http.createServer((_req, res) => {
      callCount++;
      if (callCount < 3) {
        // Immediately destroy the socket — triggers ECONNRESET (network error → retried)
        res.socket?.destroy();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'retry-sess' }));
    });

    const retryPort = await listen(retryServer);
    try {
      const client = new OpenCodeClient({ port: retryPort });
      const id = await client.createSession();
      expect(id).toBe('retry-sess');
      expect(callCount).toBe(3);
      client.destroy();
    } finally {
      await close(retryServer);
    }
  });
});

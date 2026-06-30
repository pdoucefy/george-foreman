import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenCodeProcess } from '../opencode-process.ts';
import type { Spawner } from '../opencode-process.ts';

// ---------------------------------------------------------------------------
// Mock node:http
// vi.hoisted: ensures mockHttpGet exists before vi.mock() runs (vitest hoists
// vi.mock calls to the top of the file, before module-scope declarations).
// The implementation is set in beforeEach so it closes over the live healthQueue.
// ---------------------------------------------------------------------------

type HealthResponse = { healthy: boolean } | 'error';
let healthQueue: HealthResponse[] = [];

const { mockHttpGet } = vi.hoisted(() => ({ mockHttpGet: vi.fn() }));

vi.mock('node:http', () => ({
  default: { get: mockHttpGet },
  get: mockHttpGet,
}));

// ---------------------------------------------------------------------------
// Fake ChildProcess
// ---------------------------------------------------------------------------

// FakeChildProcess extends EventEmitter (to get emit/on/once) and adds the
// stdout/stderr/kill fields required by SpawnResult.
type FakeChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

const makeFakeChild = (): FakeChildProcess => {
  const proc = new EventEmitter() as FakeChildProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn((_signal?: string) => undefined);
  return proc;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emitStdoutLine = (child: FakeChildProcess, line: string): void => {
  child.stdout.emit('data', Buffer.from(`${line}\n`));
};

const emitStderrLine = (child: FakeChildProcess, line: string): void => {
  child.stderr.emit('data', Buffer.from(`${line}\n`));
};

const exitChild = (child: FakeChildProcess, code: number | null): void => {
  child.emit('exit', code, null);
};

const makeSpawner = (child: FakeChildProcess): Spawner => vi.fn(() => child);

/**
 * Drain microtasks, then advance fake timers by `ms`, then drain microtasks again.
 * Use this instead of plain advanceTimersByTime so that Promise.resolve().then()
 * callbacks (e.g. inside mockHttpGet) are flushed before the next timer fires.
 */
const tick = async (ms = 0): Promise<void> => {
  // flush pending microtasks
  await Promise.resolve();
  await Promise.resolve();
  if (ms > 0) {
    vi.advanceTimersByTime(ms);
    // flush microtasks queued by the timers
    await Promise.resolve();
    await Promise.resolve();
  }
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  healthQueue = [];

  // Give mockHttpGet its implementation now that healthQueue is ready.
  mockHttpGet.mockImplementation(
    (_url: string, callback: (res: EventEmitter) => void): EventEmitter => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = 200;
      const req = new EventEmitter();

      // Use queueMicrotask so this resolves in the same microtask flush as tick().
      queueMicrotask(() => {
        const next = healthQueue.shift();
        if (next === 'error' || next === undefined) {
          req.emit('error', new Error('ECONNREFUSED'));
        } else {
          callback(res);
          res.emit('data', Buffer.from(JSON.stringify(next)));
          res.emit('end');
        }
      });

      return req;
    },
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: wait for a specific event on proc, advancing timers as needed
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves with the first emission of `eventName` on
 * `proc`. The promise races with the fake-timer clock: we advance in 200ms
 * steps up to `maxMs` to allow the internal poll loops to fire.
 */
const waitForEvent = <T>(emitter: EventEmitter, eventName: string, maxMs = 35_000): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    emitter.once(eventName, resolve);
    // Safety: if the event never fires within maxMs, reject
    const guard = setTimeout(() => {
      reject(new Error(`Event "${eventName}" did not fire within ${maxMs}ms`));
    }, maxMs + 1000);
    emitter.once(eventName, () => clearTimeout(guard));
  });

// ---------------------------------------------------------------------------
// Port discovery
// ---------------------------------------------------------------------------

describe('port discovery', () => {
  it('discovers port from "listening on :PORT" pattern', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-1', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();
    emitStdoutLine(child, 'Server listening on http://127.0.0.1:5001');
    await tick(200);

    const { port } = await readyPromise;
    expect(port).toBe(5001);
    expect(proc.getPort()).toBe(5001);
  });

  it('discovers port from "started :PORT" pattern', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-2', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();
    emitStdoutLine(child, 'opencode started :5002');
    await tick(200);

    const { port } = await readyPromise;
    expect(port).toBe(5002);
  });

  it('discovers port from fallback "/:PORT" pattern', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-3', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();
    emitStdoutLine(child, 'opencode ready on port :5003');
    await tick(200);

    const { port } = await readyPromise;
    expect(port).toBe(5003);
  });

  it('falls back to port 4096 when no port found in stdout within 10 seconds', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-4', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();
    // No port emitted — advance past 10s port-discovery timeout
    vi.advanceTimersByTime(10_000);
    // Then advance one health poll interval
    await tick(200);

    const { port } = await readyPromise;
    expect(port).toBe(4096);
  });
});

// ---------------------------------------------------------------------------
// Health polling
// ---------------------------------------------------------------------------

describe('health polling', () => {
  it('emits ready when health returns { healthy: true } on first poll', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-5', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5005');
    await tick(200);

    const { port } = await readyPromise;
    expect(port).toBe(5005);
  });

  it('retries health poll every 200ms until healthy', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    // First two polls error, third succeeds
    healthQueue.push('error', 'error', { healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-6', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5006');
    await tick(200); // poll 1 — error
    await tick(200); // poll 2 — error
    await tick(200); // poll 3 — healthy

    const { port } = await readyPromise;
    expect(port).toBe(5006);
  });

  it('emits failed after 30 seconds of failed health polls from spawn time', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    // Fill queue with errors (150 × 200ms = 30s)
    for (let i = 0; i < 200; i++) healthQueue.push('error');

    const proc = new OpenCodeProcess({ jobId: 'job-7', worktreePath: '/tmp/wt', spawner });
    const failedPromise = waitForEvent<{ reason: string; log: string }>(proc, 'failed');

    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5007');

    // advanceTimersByTimeAsync interleaves timer firing and microtask flushing,
    // which is required here: each poll() fires http.get() (queueMicrotask),
    // then schedules the next setTimeout(poll, 200). Without async interleaving,
    // the microtasks pile up unflushed and the deadline branch never runs.
    await vi.advanceTimersByTimeAsync(30_200);

    const { reason } = await failedPromise;
    expect(reason).toBe('opencode serve did not become ready within 30 seconds');
    expect(child.kill).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Crash handling
// ---------------------------------------------------------------------------

describe('crash handling', () => {
  it('auto-restarts once on first crash and emits ready with new port', async () => {
    let spawnCount = 0;
    const children: FakeChildProcess[] = [makeFakeChild(), makeFakeChild()];
    const spawner: Spawner = vi.fn(() => children[spawnCount++]!);

    // Only the second spawn gets a healthy response
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-8', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();

    // First child: emit a port, then crash immediately (before health poll)
    emitStdoutLine(children[0]!, 'listening on :5008');
    await tick();
    exitChild(children[0]!, 1); // crash — crashCount was 0
    await tick();

    // Wait 1 second (restart delay)
    vi.advanceTimersByTime(1_000);
    await tick();

    // Second spawn: emit port and let health poll succeed
    emitStdoutLine(children[1]!, 'listening on :5009');
    await tick(200); // health poll fires

    const { port } = await readyPromise;
    expect(port).toBe(5009);
    expect(spawner).toHaveBeenCalledTimes(2);
  });

  it('emits failed with "failed to restart" when restart health poll times out', async () => {
    let spawnCount = 0;
    const children: FakeChildProcess[] = [makeFakeChild(), makeFakeChild()];
    const spawner: Spawner = vi.fn(() => children[spawnCount++]!);
    // All health polls fail
    for (let i = 0; i < 200; i++) healthQueue.push('error');

    const proc = new OpenCodeProcess({ jobId: 'job-9', worktreePath: '/tmp/wt', spawner });
    const failedPromise = waitForEvent<{ reason: string; log: string }>(proc, 'failed');

    proc.start();
    await tick();
    emitStdoutLine(children[0]!, 'listening on :5010');
    await tick();
    exitChild(children[0]!, 1); // first crash
    await tick();

    vi.advanceTimersByTime(1_000); // restart delay
    await tick();

    emitStdoutLine(children[1]!, 'listening on :5011');
    await vi.advanceTimersByTimeAsync(30_200); // health timeout on second spawn

    const { reason } = await failedPromise;
    expect(reason).toBe('opencode serve failed to restart');
  });

  it('emits failed with "crashed twice" on second crash', async () => {
    let spawnCount = 0;
    const children: FakeChildProcess[] = [makeFakeChild(), makeFakeChild()];
    const spawner: Spawner = vi.fn(() => children[spawnCount++]!);

    // Second spawn becomes healthy
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-10', worktreePath: '/tmp/wt', spawner });
    // Listen for ready on second spawn, then crash again
    const failedPromise = waitForEvent<{ reason: string; log: string }>(proc, 'failed');

    proc.start();
    await tick();

    // First crash
    emitStdoutLine(children[0]!, 'listening on :5012');
    await tick();
    exitChild(children[0]!, 1);
    await tick();

    vi.advanceTimersByTime(1_000); // restart delay
    await tick();

    // Second spawn becomes ready
    emitStdoutLine(children[1]!, 'listening on :5013');
    await tick(200); // health poll → ready

    // Wait for ready to be emitted
    await new Promise<void>((resolve) => {
      if (proc.getPort() !== null) {
        resolve();
      } else {
        proc.once('ready', () => resolve());
      }
    });

    // Second crash
    exitChild(children[1]!, 1);
    await tick();

    const { reason } = await failedPromise;
    expect(reason).toBe('opencode serve crashed twice');
  });
});

// ---------------------------------------------------------------------------
// stop()
// ---------------------------------------------------------------------------

describe('stop()', () => {
  it('does not emit failed when process exits with code 0 after stop()', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-11', worktreePath: '/tmp/wt', spawner });
    const failedEvents: unknown[] = [];
    proc.on('failed', (e) => failedEvents.push(e));
    const exitPromise = waitForEvent<{ code: number | null; log: string }>(proc, 'exit');

    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5014');
    await tick(200);
    // ensure ready was emitted
    await new Promise<void>((resolve) => {
      if (proc.getPort() !== null) resolve();
      else proc.once('ready', () => resolve());
    });

    const stopPromise = proc.stop();
    await tick();
    exitChild(child, 0); // clean exit
    await tick();
    await stopPromise;

    await exitPromise;
    expect(failedEvents).toHaveLength(0);
  });

  it('resolves stop() without SIGKILL when process exits within 3 seconds', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-12', worktreePath: '/tmp/wt', spawner });
    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5015');
    await tick(200);
    await new Promise<void>((resolve) => {
      if (proc.getPort() !== null) resolve();
      else proc.once('ready', () => resolve());
    });

    const stopPromise = proc.stop();
    await tick();
    exitChild(child, 0); // exits before 3s timeout
    await tick();
    await stopPromise;

    const sigkillCalls = child.kill.mock.calls.filter((args: unknown[]) => args[0] === 'SIGKILL');
    expect(sigkillCalls).toHaveLength(0);
    const sigtermCalls = child.kill.mock.calls.filter(
      (args: unknown[]) => args[0] === 'SIGTERM' || args[0] === undefined,
    );
    expect(sigtermCalls.length).toBeGreaterThan(0);
  });

  it('sends SIGKILL after 3 seconds if process has not exited', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-13', worktreePath: '/tmp/wt', spawner });
    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5016');
    await tick(200);
    await new Promise<void>((resolve) => {
      if (proc.getPort() !== null) resolve();
      else proc.once('ready', () => resolve());
    });

    const stopPromise = proc.stop();
    await tick();
    // Advance past the 3 second SIGKILL timeout without the process exiting
    vi.advanceTimersByTime(3_000);
    await tick();
    // Now the SIGKILL has been sent; simulate the process dying
    exitChild(child, null);
    await tick();
    await stopPromise;

    const sigkillCalls = child.kill.mock.calls.filter((args: unknown[]) => args[0] === 'SIGKILL');
    expect(sigkillCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

describe('ring buffer', () => {
  it('preserves all lines when log is under 500 KB', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-14', worktreePath: '/tmp/wt', spawner });
    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5017');
    emitStdoutLine(child, 'line 1');
    emitStdoutLine(child, 'line 2');
    await tick(200);

    const log = proc.getLog();
    expect(log).toContain('line 1');
    expect(log).toContain('line 2');
  });

  it('drops oldest lines when buffer exceeds 500 KB', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-15', worktreePath: '/tmp/wt', spawner });
    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5018');

    // 600 lines × ~1024 bytes = ~600 KB — exceeds 500 KB limit
    const bigLine = 'x'.repeat(1020); // ~1 KB per line (plus newline overhead)
    for (let i = 0; i < 600; i++) {
      emitStdoutLine(child, `${i}: ${bigLine}`);
    }
    await tick();

    const log = proc.getLog();
    const logBytes = Buffer.byteLength(log, 'utf8');
    expect(logBytes).toBeLessThanOrEqual(500 * 1024 + 1100); // within one line of limit
    // Earliest lines dropped
    expect(log).not.toMatch(/^0: /m);
    // Latest lines present
    expect(log).toContain('599:');
  });

  it('includes accumulated log in the failed event', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    for (let i = 0; i < 200; i++) healthQueue.push('error');

    const proc = new OpenCodeProcess({ jobId: 'job-16', worktreePath: '/tmp/wt', spawner });
    const failedPromise = waitForEvent<{ reason: string; log: string }>(proc, 'failed');

    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5019');
    emitStdoutLine(child, 'diagnostic line from opencode');

    await vi.advanceTimersByTimeAsync(30_200);

    const { log } = await failedPromise;
    expect(log).toContain('diagnostic line from opencode');
  });

  it('includes accumulated log in the exit event', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-17', worktreePath: '/tmp/wt', spawner });
    const exitPromise = waitForEvent<{ code: number | null; log: string }>(proc, 'exit');

    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5020');
    emitStdoutLine(child, 'exit diagnostic');
    await tick(200);
    await new Promise<void>((resolve) => {
      if (proc.getPort() !== null) resolve();
      else proc.once('ready', () => resolve());
    });

    const stopPromise = proc.stop();
    await tick();
    exitChild(child, 0);
    await tick();
    await stopPromise;

    const { log } = await exitPromise;
    expect(log).toContain('exit diagnostic');
  });

  it('captures both stdout and stderr lines in the ring buffer', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-18', worktreePath: '/tmp/wt', spawner });
    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5021');
    emitStdoutLine(child, 'stdout message');
    emitStderrLine(child, 'stderr message');
    await tick(200);

    const log = proc.getLog();
    expect(log).toContain('stdout message');
    expect(log).toContain('stderr message');
  });
});

// ---------------------------------------------------------------------------
// getPort()
// ---------------------------------------------------------------------------

describe('getPort()', () => {
  it('returns null before port is discovered', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);

    const proc = new OpenCodeProcess({ jobId: 'job-19', worktreePath: '/tmp/wt', spawner });
    proc.start();
    await tick();

    expect(proc.getPort()).toBeNull();
  });

  it('returns the correct port after the ready event', async () => {
    const child = makeFakeChild();
    const spawner = makeSpawner(child);
    healthQueue.push({ healthy: true });

    const proc = new OpenCodeProcess({ jobId: 'job-20', worktreePath: '/tmp/wt', spawner });
    const readyPromise = waitForEvent<{ port: number }>(proc, 'ready');

    proc.start();
    await tick();
    emitStdoutLine(child, 'listening on :5022');
    await tick(200);

    await readyPromise;
    expect(proc.getPort()).toBe(5022);
  });
});

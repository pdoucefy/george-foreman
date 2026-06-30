import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import http from 'node:http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape of the ChildProcess returned by spawn() that we use.
 * Typed structurally so tests can inject a fake without depending on the
 * full ChildProcess class.
 */
export type SpawnResult = {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (signal?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => SpawnResult;
  once: (event: string, listener: (...args: unknown[]) => void) => SpawnResult;
};

/**
 * A function with the same signature as child_process.spawn() but returning
 * SpawnResult. Defaults to the real spawn; injected in tests.
 */
export type Spawner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ['ignore', 'pipe', 'pipe'] },
) => SpawnResult;

// ---------------------------------------------------------------------------
// Event map (documentation — TypeScript enforces via declaration merging)
// ---------------------------------------------------------------------------

export type OpenCodeProcessEvents = {
  ready: [{ port: number }];
  failed: [{ reason: string; log: string }];
  exit: [{ code: number | null; log: string }];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT_DISCOVERY_TIMEOUT_MS = 10_000;
const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_TOTAL_TIMEOUT_MS = 30_000;
const STOP_SIGKILL_TIMEOUT_MS = 3_000;
const CRASH_RESTART_DELAY_MS = 1_000;
const FALLBACK_PORT = 4096;
const MAX_LOG_BYTES = 500 * 1024; // 500 KB

/** Ordered list of regexes for port discovery — highest priority first. */
const PORT_PATTERNS: RegExp[] = [/listening on.*:(\d+)/i, /started.*:(\d+)/i, /:(\d+)/];

// ---------------------------------------------------------------------------
// Module-level pure helpers
// ---------------------------------------------------------------------------

/** Extract the first port number from a stdout line using the priority-ordered patterns. */
const extractPort = (line: string): number | null => {
  for (const pattern of PORT_PATTERNS) {
    const match = pattern.exec(line);
    if (match?.[1]) {
      const port = parseInt(match[1], 10);
      if (!isNaN(port) && port > 0) return port;
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// OpenCodeProcess
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of a single `opencode serve` process for one job.
 *
 * Emits:
 *   - 'ready'  — { port }          server is healthy and ready
 *   - 'failed' — { reason, log }   unrecoverable failure
 *   - 'exit'   — { code, log }     any exit (including intentional stop)
 *
 * The caller (job-manager, M15) is responsible for persisting the log to
 * electron-store on 'failed' and 'exit'.
 */
export class OpenCodeProcess extends EventEmitter {
  private readonly _worktreePath: string;
  private readonly _spawner: Spawner;

  private _port: number | null = null;
  private _crashCount = 0;
  private _stoppedIntentionally = false;
  private _currentChild: SpawnResult | null = null;

  /**
   * Monotonically-increasing generation counter.
   * Incremented on every spawn. Health-poll closures capture the generation
   * at creation time and bail if the generation has since changed (i.e., the
   * process crashed and a new one was spawned).
   */
  private _generation = 0;

  // Ring buffer state
  private _logLines: string[] = [];
  private _logBytes = 0;

  constructor(params: { jobId: string; worktreePath: string; spawner?: Spawner }) {
    super();
    this._worktreePath = params.worktreePath;
    this._spawner = params.spawner ?? (spawn as unknown as Spawner);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Start the opencode serve process. */
  readonly start = (): void => {
    this._spawn();
  };

  /**
   * Stop the process intentionally.
   * SIGTERM → wait up to 3s → SIGKILL.
   * Returns a Promise that resolves when the process has exited.
   */
  readonly stop = (): Promise<void> => {
    if (!this._currentChild) return Promise.resolve();

    this._stoppedIntentionally = true;
    // Invalidate the current generation so any pending health polls abort
    this._generation += 1;
    const child = this._currentChild;

    return new Promise<void>((resolve) => {
      // eslint-disable-next-line prefer-const
      let killTimer: ReturnType<typeof setTimeout>;

      const onExit = (): void => {
        clearTimeout(killTimer);
        resolve();
      };

      child.once('exit', onExit);
      child.kill('SIGTERM');

      killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, STOP_SIGKILL_TIMEOUT_MS);
    });
  };

  /** Returns the discovered port, or null if not yet known. */
  readonly getPort = (): number | null => this._port;

  /** Returns the full accumulated process log as a single string. */
  readonly getLog = (): string => this._logLines.join('\n');

  // ---------------------------------------------------------------------------
  // Internal: spawn + lifecycle
  // ---------------------------------------------------------------------------

  private _spawn(): void {
    this._generation += 1;
    const myGeneration = this._generation;

    const child = this._spawner('opencode', ['serve', '--port', '0', '--hostname', '127.0.0.1'], {
      cwd: this._worktreePath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._currentChild = child;

    // --- Port scanning + stdout/stderr capture ---

    let portFound = false;
    const spawnTime = Date.now();
    // eslint-disable-next-line prefer-const
    let portDiscoveryTimer: ReturnType<typeof setTimeout>;

    const handleLine = (line: string): void => {
      this._appendLine(line);
      if (!portFound && myGeneration === this._generation) {
        const discovered = extractPort(line);
        if (discovered !== null) {
          portFound = true;
          clearTimeout(portDiscoveryTimer);
          this._port = discovered;
          this._startHealthPoll(spawnTime, myGeneration);
        }
      }
    };

    // Line-buffer parser for stdout
    let stdoutBuf = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) handleLine(line);
      }
    });

    // Line-buffer parser for stderr
    let stderrBuf = '';
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) this._appendLine(line);
      }
    });

    // Port discovery timeout — fall back to 4096
    portDiscoveryTimer = setTimeout(() => {
      if (!portFound && myGeneration === this._generation) {
        portFound = true;
        this._port = FALLBACK_PORT;
        this._startHealthPoll(spawnTime, myGeneration);
      }
    }, PORT_DISCOVERY_TIMEOUT_MS);

    // Handle process exit
    child.on('exit', (...args: unknown[]) => {
      const code = args[0] as number | null;
      clearTimeout(portDiscoveryTimer);

      if (this._stoppedIntentionally && code === 0) {
        // Clean intentional stop — emit exit and done
        this.emit('exit', { code, log: this.getLog() });
        return;
      }

      if (myGeneration !== this._generation) {
        // Stale exit from a generation we've already moved past — ignore
        return;
      }

      // Unexpected exit — treat as crash; bump generation to cancel stale polls
      this._generation += 1;
      this._handleCrash();
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: health polling
  // ---------------------------------------------------------------------------

  private _startHealthPoll(spawnTime: number, generation: number, isRestart = false): void {
    const deadline = spawnTime + HEALTH_POLL_TOTAL_TIMEOUT_MS;

    const poll = (): void => {
      // Bail if this health poll belongs to an old generation
      if (generation !== this._generation) return;

      if (Date.now() >= deadline) {
        this._currentChild?.kill('SIGKILL');
        this._generation += 1; // cancel any further polls
        const reason = isRestart
          ? 'opencode serve failed to restart'
          : 'opencode serve did not become ready within 30 seconds';
        this.emit('failed', {
          reason,
          log: this.getLog(),
        });
        return;
      }

      const port = this._port!;
      const url = `http://127.0.0.1:${port}/global/health`;

      const req = http.get(url, (res) => {
        // Check generation again — process may have crashed while request was in flight
        if (generation !== this._generation) return;

        let body = '';
        res.on('data', (chunk: Buffer | string) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          if (generation !== this._generation) return;

          let healthy = false;
          try {
            const parsed = JSON.parse(body) as unknown;
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              'healthy' in parsed &&
              (parsed as Record<string, unknown>)['healthy'] === true
            ) {
              healthy = true;
            }
          } catch {
            // ignore parse errors — not healthy
          }

          if (healthy) {
            this.emit('ready', { port });
          } else {
            setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
          }
        });
      });

      req.on('error', () => {
        if (generation !== this._generation) return;
        setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
      });
    };

    setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------------
  // Internal: crash handling
  // ---------------------------------------------------------------------------

  private _handleCrash(): void {
    if (this._crashCount === 0) {
      this._crashCount = 1;
      setTimeout(() => {
        if (this._stoppedIntentionally) return; // stop() was called during restart delay
        this._port = null; // reset port for new discovery
        this._spawnRestart();
      }, CRASH_RESTART_DELAY_MS);
    } else {
      this.emit('failed', {
        reason: 'opencode serve crashed twice',
        log: this.getLog(),
      });
    }
  }

  /**
   * Re-spawn after a crash. Same as _spawn() but health poll uses the
   * "failed to restart" error message on timeout.
   */
  private _spawnRestart(): void {
    this._generation += 1;
    const myGeneration = this._generation;

    const child = this._spawner('opencode', ['serve', '--port', '0', '--hostname', '127.0.0.1'], {
      cwd: this._worktreePath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._currentChild = child;

    let portFound = false;
    const spawnTime = Date.now();
    // eslint-disable-next-line prefer-const
    let portDiscoveryTimer: ReturnType<typeof setTimeout>;

    const handleLine = (line: string): void => {
      this._appendLine(line);
      if (!portFound && myGeneration === this._generation) {
        const discovered = extractPort(line);
        if (discovered !== null) {
          portFound = true;
          clearTimeout(portDiscoveryTimer);
          this._port = discovered;
          this._startHealthPoll(spawnTime, myGeneration, true);
        }
      }
    };

    let stdoutBuf = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) handleLine(line);
      }
    });

    let stderrBuf = '';
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) this._appendLine(line);
      }
    });

    portDiscoveryTimer = setTimeout(() => {
      if (!portFound && myGeneration === this._generation) {
        portFound = true;
        this._port = FALLBACK_PORT;
        this._startHealthPoll(spawnTime, myGeneration, true);
      }
    }, PORT_DISCOVERY_TIMEOUT_MS);

    child.on('exit', (...args: unknown[]) => {
      const code = args[0] as number | null;
      clearTimeout(portDiscoveryTimer);

      if (this._stoppedIntentionally && code === 0) {
        this.emit('exit', { code, log: this.getLog() });
        return;
      }

      if (myGeneration !== this._generation) return;

      this._generation += 1;
      this._handleCrash();
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: ring buffer
  // ---------------------------------------------------------------------------

  private _appendLine(line: string): void {
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1; // +1 for '\n'
    this._logLines.push(line);
    this._logBytes += lineBytes;

    while (this._logBytes > MAX_LOG_BYTES && this._logLines.length > 1) {
      const dropped = this._logLines.shift()!;
      this._logBytes -= Buffer.byteLength(dropped, 'utf8') + 1;
    }
  }
}

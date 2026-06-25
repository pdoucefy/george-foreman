// ---------------------------------------------------------------------------
// Imports — after mocks (import/first disabled: vi.mock hoisting requires this order)
// ---------------------------------------------------------------------------
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerIpcHandlers } from '../ipc-handlers.ts';
import { storeGet } from '../store.ts';

// ---------------------------------------------------------------------------
// Mock electron-store BEFORE importing store.ts (which runs migration on import)
// ---------------------------------------------------------------------------

const { dataRef } = vi.hoisted(() => ({
  dataRef: { current: {} as Record<string, unknown> },
}));

vi.mock('electron-store', () => ({
  default: class MockElectronStore {
    defaults: Record<string, unknown>;

    constructor(options: { defaults?: Record<string, unknown> } = {}) {
      this.defaults = options.defaults ?? {};
      for (const [key, value] of Object.entries(this.defaults)) {
        if (!(key in dataRef.current)) {
          dataRef.current[key] = value;
        }
      }
    }

    get(key: string): unknown {
      return dataRef.current[key];
    }

    set(key: string, value: unknown): void {
      dataRef.current[key] = value;
    }

    clear(): void {
      dataRef.current = {};
    }

    get store(): Record<string, unknown> {
      return { ...dataRef.current };
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock electron (BrowserWindow / dialog) — ipc-handlers imports from electron
// ---------------------------------------------------------------------------

const { mockSend, mockDialog } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockDialog: { showOpenDialog: vi.fn() },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: mockDialog,
}));

// ---------------------------------------------------------------------------
// Mock binary-check
// ---------------------------------------------------------------------------

const { mockCheckOpenCodeBinary } = vi.hoisted(() => ({
  mockCheckOpenCodeBinary: vi.fn(),
}));

vi.mock('../binary-check.ts', () => ({
  checkOpenCodeBinary: mockCheckOpenCodeBinary,
}));

// ---------------------------------------------------------------------------
// Mock @electron-toolkit/utils — expose isDev flag for dev:clear-store branch
// ---------------------------------------------------------------------------

const { mockIsDev } = vi.hoisted(() => ({
  mockIsDev: { dev: true },
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: mockIsDev,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Capture the handler registered for a given channel so tests can invoke it
const getHandler = (channel: string): ((...args: unknown[]) => unknown) => {
  const { calls } = vi.mocked(ipcMain.handle).mock;
  const entry = calls.find(([ch]) => ch === channel);
  if (!entry) throw new Error(`No handler registered for channel: ${channel}`);
  return entry[1] as (...args: unknown[]) => unknown;
};

const makeFakeWindow = (): BrowserWindow =>
  ({ webContents: { send: mockSend } }) as unknown as BrowserWindow;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataRef.current = {
      schemaVersion: 1,
      config: {
        workspaceFolder: '',
        githubHandle: '',
        userWorkflowsFolder: null,
        defaultCopyGlobs: '.env\n.env.*\n.env.local',
        windowBounds: null,
      },
      jobs: {},
      jobLogs: {},
    };
    registerIpcHandlers(makeFakeWindow());
  });

  describe('onboarding:is-complete', () => {
    it('returns false when workspaceFolder is empty', async () => {
      const handler = getHandler('onboarding:is-complete');
      const result = await handler();
      expect(result).toBe(false);
    });

    it('returns true when workspaceFolder is set', async () => {
      dataRef.current['config'] = {
        ...(dataRef.current['config'] as object),
        workspaceFolder: '/Users/me/workspace',
      };
      const handler = getHandler('onboarding:is-complete');
      const result = await handler();
      expect(result).toBe(true);
    });
  });

  describe('onboarding:complete', () => {
    it('persists workspaceFolder and githubHandle to the store', async () => {
      const handler = getHandler('onboarding:complete');
      mockCheckOpenCodeBinary.mockResolvedValue({ found: true, path: '/usr/local/bin/opencode' });

      await handler({}, { workspaceFolder: '/Users/me/repos', githubHandle: 'sam' });

      const config = storeGet('config');
      expect(config.workspaceFolder).toBe('/Users/me/repos');
      expect(config.githubHandle).toBe('sam');
    });

    it('runs checkOpenCodeBinary and sends binary:status after completion', async () => {
      const handler = getHandler('onboarding:complete');
      mockCheckOpenCodeBinary.mockResolvedValue({ found: true, path: '/usr/local/bin/opencode' });

      await handler({}, { workspaceFolder: '/Users/me/repos', githubHandle: 'sam' });

      expect(mockCheckOpenCodeBinary).toHaveBeenCalledOnce();
      expect(mockSend).toHaveBeenCalledWith('binary:status', { found: true });
    });
  });

  describe('binary:check', () => {
    it('returns the result of checkOpenCodeBinary', async () => {
      mockCheckOpenCodeBinary.mockResolvedValue({ found: false });
      const handler = getHandler('binary:check');
      const result = await handler();
      expect(result).toEqual({ found: false });
    });

    it('sends binary:status push to renderer', async () => {
      mockCheckOpenCodeBinary.mockResolvedValue({ found: true, path: '/usr/bin/opencode' });
      const handler = getHandler('binary:check');
      await handler();
      expect(mockSend).toHaveBeenCalledWith('binary:status', { found: true });
    });
  });

  describe('binary:recheck', () => {
    it('returns found=true when binary is now present', async () => {
      mockCheckOpenCodeBinary.mockResolvedValue({ found: true, path: '/usr/bin/opencode' });
      const handler = getHandler('binary:recheck');
      const result = await handler();
      expect(result).toEqual({ found: true, path: '/usr/bin/opencode' });
    });

    it('sends binary:status push regardless of found value', async () => {
      mockCheckOpenCodeBinary.mockResolvedValue({ found: false });
      const handler = getHandler('binary:recheck');
      await handler();
      expect(mockSend).toHaveBeenCalledWith('binary:status', { found: false });
    });
  });

  describe('dialog:open-directory', () => {
    it('returns the selected path when user picks a directory', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/Users/me'] });
      const handler = getHandler('dialog:open-directory');
      const result = await handler();
      expect(result).toBe('/Users/me');
    });

    it('returns null when dialog is cancelled', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const handler = getHandler('dialog:open-directory');
      const result = await handler();
      expect(result).toBeNull();
    });
  });

  describe('dev:clear-store (dev mode only)', () => {
    it('registers dev:clear-store handler when is.dev is true', () => {
      expect(() => getHandler('dev:clear-store')).not.toThrow();
    });

    it('clears the entire store', async () => {
      dataRef.current['config'] = {
        ...(dataRef.current['config'] as object),
        workspaceFolder: '/some/path',
      };
      const handler = getHandler('dev:clear-store');
      await handler();
      expect(dataRef.current).toEqual({});
    });

    it('does not register dev:clear-store when is.dev is false', () => {
      vi.clearAllMocks();
      mockIsDev.dev = false;
      registerIpcHandlers(makeFakeWindow());
      expect(() => getHandler('dev:clear-store')).toThrow(
        'No handler registered for channel: dev:clear-store',
      );
      mockIsDev.dev = true; // restore for subsequent tests
    });
  });
});

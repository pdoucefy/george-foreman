import { execFile } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import { checkOpenCodeBinary } from '../binary-check.ts';

// mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

describe('checkOpenCodeBinary', () => {
  it('returns found=true with path when opencode is on PATH', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback: unknown) => {
      (callback as (err: null, stdout: string) => void)(null, '/usr/local/bin/opencode\n');
      return {} as ReturnType<typeof execFile>;
    });

    const result = await checkOpenCodeBinary();

    expect(result).toEqual({ found: true, path: '/usr/local/bin/opencode' });
  });

  it('returns found=false when opencode is not on PATH', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback: unknown) => {
      (callback as (err: Error) => void)(new Error('not found'));
      return {} as ReturnType<typeof execFile>;
    });

    const result = await checkOpenCodeBinary();

    expect(result).toEqual({ found: false });
  });

  it('trims whitespace from the returned path', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback: unknown) => {
      (callback as (err: null, stdout: string) => void)(null, '  /opt/homebrew/bin/opencode  \n');
      return {} as ReturnType<typeof execFile>;
    });

    const result = await checkOpenCodeBinary();

    expect(result).toEqual({ found: true, path: '/opt/homebrew/bin/opencode' });
  });

  it('returns found=false when stdout is empty (which resolves to empty path)', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback: unknown) => {
      (callback as (err: null, stdout: string) => void)(null, '   ');
      return {} as ReturnType<typeof execFile>;
    });

    const result = await checkOpenCodeBinary();

    expect(result).toEqual({ found: false });
  });
});

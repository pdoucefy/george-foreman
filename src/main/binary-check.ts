import { execFile } from 'node:child_process';

// Binary check: runs `which opencode` to verify the binary is on PATH.

export const checkOpenCodeBinary = (): Promise<{ found: boolean; path?: string }> =>
  new Promise((resolve) => {
    execFile('which', ['opencode'], (err, stdout) => {
      if (err) {
        resolve({ found: false });
        return;
      }
      const path = stdout.trim();
      if (!path) {
        resolve({ found: false });
        return;
      }
      resolve({ found: true, path });
    });
  });

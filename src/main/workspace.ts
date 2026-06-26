import type { Repo } from '@shared/types';

import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

// Workspace scanning: discovers git repos in the workspace folder.

const runGit = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', args, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });

const detectDefaultBranch = async (repoPath: string): Promise<string> => {
  // Step 1: try symbolic-ref
  try {
    const ref = await runGit([
      '-C',
      repoPath,
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      '--short',
    ]);
    // returns "origin/main" → strip "origin/" prefix
    const prefix = 'origin/';
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
    if (ref) return ref;
  } catch {
    // fall through
  }

  // Step 2: check if refs/heads/main exists
  try {
    await runGit(['-C', repoPath, 'show-ref', '--verify', 'refs/heads/main']);
    return 'main';
  } catch {
    // fall through
  }

  // Step 3: check if refs/heads/master exists
  try {
    await runGit(['-C', repoPath, 'show-ref', '--verify', 'refs/heads/master']);
    return 'master';
  } catch {
    // fall through
  }

  return 'main';
};

export const scanWorkspace = async (workspaceFolder: string): Promise<Repo[]> => {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(workspaceFolder, { withFileTypes: true, encoding: 'utf8' });
  } catch (err) {
    console.warn('[workspace] could not read workspace folder:', err);
    return [];
  }

  const repos = await Promise.all(
    entries.map(async (entry: Dirent<string>): Promise<Repo | null> => {
      try {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) return null;

        const entryPath = join(workspaceFolder, entry.name);

        // Resolve symlinks so git commands work on the real path
        const realPath = await fs.realpath(entryPath);

        // Check .git exists and is a directory (not a worktree file)
        let gitStat: Awaited<ReturnType<typeof fs.stat>>;
        try {
          gitStat = await fs.stat(join(realPath, '.git'));
        } catch {
          return null; // no .git → not a repo
        }
        if (!gitStat.isDirectory()) return null; // .git file → worktree, skip

        const defaultBranch = await detectDefaultBranch(realPath);

        return { name: entry.name, path: realPath, defaultBranch };
      } catch (err) {
        console.warn(`[workspace] skipping entry "${entry.name}":`, err);
        return null;
      }
    }),
  );

  return repos.filter((r): r is Repo => r !== null).sort((a, b) => a.name.localeCompare(b.name));
};

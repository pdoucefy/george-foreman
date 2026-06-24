/**
 * release.ts
 *
 * Bumps package.json version, commits, tags, and pushes to origin.
 * Triggers the CI packaging pipeline (v* tag → GitHub Release).
 *
 * Usage:
 *   pnpm release patch   # 0.1.0 → 0.1.1
 *   pnpm release minor   # 0.1.0 → 0.2.0
 *   pnpm release major   # 0.1.0 → 1.0.0
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

const run = (cmd: string, args: string[], opts: object = {}): string =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();

const die = (msg: string): never => {
  console.error(`\nError: ${msg}\n`);
  process.exit(1);
};

const bumpVersion = (version: string, bump: string): string => {
  const [major, minor, patch] = version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return die(`Unknown bump type "${bump}". Use: patch | minor | major`);
};

// ── Validate args ─────────────────────────────────────────────────────────────

const [, , bump] = process.argv;
if (!['patch', 'minor', 'major'].includes(bump)) {
  die(`Missing or invalid argument.\n  Usage: pnpm release patch|minor|major`);
}

// ── Guard: must be on main ────────────────────────────────────────────────────

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
  die(`Must be on branch "main" to release (currently on "${branch}").`);
}

// ── Guard: working tree must be clean ────────────────────────────────────────

const status = run('git', ['status', '--porcelain']);
if (status.length > 0) {
  die(`Working tree is not clean. Commit or stash all changes before releasing.\n\n${status}`);
}

// ── Guard: main must be up to date with origin ────────────────────────────────

console.log('Fetching origin...');
run('git', ['fetch', 'origin']);

const localRev = run('git', ['rev-parse', 'main']);
const remoteRev = run('git', ['rev-parse', 'origin/main']);
if (localRev !== remoteRev) {
  die(`Local main is not in sync with origin/main. Pull or push first.`);
}

// ── Bump version ──────────────────────────────────────────────────────────────

const pkgPath = resolve(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version as string;
const newVersion = bumpVersion(oldVersion, bump);
const tag = `v${newVersion}`;

console.log(`\nBumping version: ${oldVersion} → ${newVersion}  (${bump})`);

pkg.version = newVersion;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

// ── Commit, tag, push ─────────────────────────────────────────────────────────

console.log('Committing package.json...');
run('git', ['add', 'package.json']);
run('git', ['commit', '-m', `chore: release ${tag}`]);

console.log(`Creating tag ${tag}...`);
run('git', ['tag', tag]);

console.log(`Pushing main and ${tag} to origin...`);
run('git', ['push', 'origin', 'main', '--tags']);

console.log(`\nReleased ${tag}  ✓`);
console.log('CI will package the DMG and attach it to the GitHub Release.');

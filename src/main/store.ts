import { schStore } from '@shared/types';
import type { StoreSchema } from '@shared/types';

import ElectronStore from 'electron-store';

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

const CURRENT_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Store defaults (used for brand-new installs)
// ---------------------------------------------------------------------------

const STORE_DEFAULTS: StoreSchema = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
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

// ---------------------------------------------------------------------------
// electron-store instance
// ---------------------------------------------------------------------------

export const store = new ElectronStore<StoreSchema>({
  name: 'george-foreman',
  defaults: STORE_DEFAULTS,
});

// ---------------------------------------------------------------------------
// Startup migration
// ---------------------------------------------------------------------------
// Run once when this module is first imported (app startup).
// Two-phase check:
//   1. Schema version mismatch → migrate immediately
//   2. Full Zod safeParse → migrate if store data is corrupt / unexpected shape

const migrate = (): void => {
  const config = store.get('config');
  store.clear();
  if (config) store.set('config', config);

  store.set('schemaVersion', CURRENT_SCHEMA_VERSION);
  store.set('jobs', {});
  store.set('jobLogs', {});
};

const runStartupMigration = (): void => {
  const storedVersion = store.get('schemaVersion');

  if (storedVersion !== CURRENT_SCHEMA_VERSION) {
    migrate();
    return;
  }

  // Version matches — but data could still be corrupt; validate the full shape
  const raw = store.store; // entire store as a plain object
  const result = schStore.safeParse(raw);
  if (!result.success) migrate();
};

runStartupMigration();

// ---------------------------------------------------------------------------
// Typed accessors — thin wrappers over the raw store
// ---------------------------------------------------------------------------

export const storeGet = <K extends keyof StoreSchema>(key: K): StoreSchema[K] => store.get(key);

export const storeSet = <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void => {
  store.set(key, value);
};

import type { Job, Repo } from '@shared/types';

import { create } from 'zustand';

// Renderer global state (Zustand store).
// Full shape as per ipc.md spec. Fields not yet used by M8 components
// are initialized to their zero values and will be wired in later milestones.

export type AppStore = {
  // Repos
  repos: Repo[];
  setRepos: (repos: Repo[]) => void;

  // Jobs — single map; active/archived derived from archivedAt field
  jobs: Record<string, Job>;
  upsertJob: (job: Job) => void;

  // UI state
  selectedJobId: string | null;
  selectJob: (jobId: string | null) => void;
  activeTab: 'dashboard' | 'archive';
  setActiveTab: (tab: 'dashboard' | 'archive') => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;

  // Binary check
  binaryFound: boolean | null; // null = not yet checked
  setBinaryFound: (found: boolean) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  repos: [],
  setRepos: (repos) => set({ repos }),

  jobs: {},
  upsertJob: (job) =>
    set((state) => ({
      jobs: { ...state.jobs, [job.id]: job },
    })),

  selectedJobId: null,
  selectJob: (jobId) => set({ selectedJobId: jobId }),

  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),

  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),

  binaryFound: null,
  setBinaryFound: (found) => set({ binaryFound: found }),
}));

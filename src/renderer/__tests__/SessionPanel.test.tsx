import { SessionPanel } from '@renderer/components/SessionPanel';
import { theme } from '@renderer/theme';
import type { Job } from '@shared/types';
import { render, screen } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'job-1',
  repoName: 'my-app',
  repoPath: '/workspace/my-app',
  worktreePath: '/workspace/.worktrees/job-1',
  worktreeDeleted: false,
  branchName: 'av/feature-x',
  baseBranch: 'main',
  workflowName: 'Implement Feature',
  argument: 'Feature X',
  status: 'running',
  port: 3000,
  orchestratorSessionId: 'sess-1',
  tasks: [],
  createdAt: Date.now() - 60_000,
  completedAt: null,
  archivedAt: null,
  errorMessage: null,
  pendingPermission: null,
  ...overrides,
});

describe('SessionPanel', () => {
  it('shows empty state when no job is selected', () => {
    renderWithTheme(<SessionPanel job={null} />);
    expect(screen.getByText('Select a job to view details')).toBeInTheDocument();
  });

  it('shows job header when a job is selected', () => {
    renderWithTheme(<SessionPanel job={makeJob()} />);
    expect(screen.getByText('Implement Feature')).toBeInTheDocument();
  });

  it('shows repo name in header', () => {
    renderWithTheme(<SessionPanel job={makeJob()} />);
    expect(screen.getByText('· my-app')).toBeInTheDocument();
  });

  it('shows branch name in header', () => {
    renderWithTheme(<SessionPanel job={makeJob()} />);
    expect(screen.getByText('· av/feature-x')).toBeInTheDocument();
  });
});

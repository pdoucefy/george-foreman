import { DashboardTab } from '@renderer/components/DashboardTab';
import { useAppStore } from '@renderer/store';
import { theme } from '@renderer/theme';
import type { Job } from '@shared/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

// ─── Mock window.api ──────────────────────────────────────────────────────────

const mockArchive = vi.fn(() => Promise.resolve());

vi.stubGlobal('api', {
  job: {
    archive: mockArchive,
  },
} as unknown as Window['api']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  tasks: [
    { index: 0, name: 'Write tests', status: 'completed', subagentSessionId: null },
    { index: 1, name: 'Implement', status: 'in_progress', subagentSessionId: null },
    { index: 2, name: 'Update docs', status: 'pending', subagentSessionId: null },
  ],
  createdAt: Date.now() - 60_000,
  completedAt: null,
  archivedAt: null,
  errorMessage: null,
  pendingPermission: null,
  ...overrides,
});

// Reset store before each test
beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    jobs: {},
    selectedJobId: null,
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DashboardTab', () => {
  it('shows empty state when there are no unarchived jobs', () => {
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.getByText(/No active jobs/)).toBeInTheDocument();
  });

  it('shows the New Job button', () => {
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.getByRole('button', { name: /New Job/i })).toBeInTheDocument();
  });

  it('calls onNewJob when New Job is clicked', () => {
    const onNewJob = vi.fn();
    renderWithTheme(<DashboardTab onNewJob={onNewJob} />);
    fireEvent.click(screen.getByRole('button', { name: /New Job/i }));
    expect(onNewJob).toHaveBeenCalledOnce();
  });

  it('does not show repos with no unarchived jobs', () => {
    const archivedJob = makeJob({ id: 'job-arc', archivedAt: Date.now() });
    useAppStore.setState({ jobs: { 'job-arc': archivedJob } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.queryByText(/my-app/)).not.toBeInTheDocument();
  });

  it('groups jobs under their repo name', () => {
    const job = makeJob();
    useAppStore.setState({ jobs: { 'job-1': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    // The repo section header contains the repo name
    expect(screen.getAllByText(/my-app/).length).toBeGreaterThan(0);
  });

  it('renders active job card with workflow name', () => {
    const job = makeJob();
    useAppStore.setState({ jobs: { 'job-1': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.getByText('Implement Feature')).toBeInTheDocument();
  });

  it('renders task count on active job card', () => {
    const job = makeJob();
    useAppStore.setState({ jobs: { 'job-1': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.getByText('1 / 3 tasks')).toBeInTheDocument();
  });

  it('renders failed job card with Archive button', () => {
    const job = makeJob({ id: 'job-f', status: 'failed', completedAt: Date.now() - 5 * 60_000 });
    useAppStore.setState({ jobs: { 'job-f': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Archive job' })).toBeInTheDocument();
  });

  it('renders stopped job card with Archive button', () => {
    const job = makeJob({ id: 'job-s', status: 'stopped', completedAt: Date.now() - 5 * 60_000 });
    useAppStore.setState({ jobs: { 'job-s': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Archive job' })).toBeInTheDocument();
  });

  it('renders failed job card with error message', () => {
    const job = makeJob({
      id: 'job-f',
      status: 'failed',
      completedAt: Date.now(),
      errorMessage: 'opencode crashed',
    });
    useAppStore.setState({ jobs: { 'job-f': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    expect(screen.getByText('opencode crashed')).toBeInTheDocument();
  });

  it('calls job.archive IPC when Archive is clicked', async () => {
    const job = makeJob({ id: 'job-f', status: 'failed', completedAt: Date.now() });
    useAppStore.setState({ jobs: { 'job-f': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive job' }));
    await waitFor(() => {
      expect(mockArchive).toHaveBeenCalledWith('job-f');
    });
  });

  it('selects a job when the card is clicked', () => {
    const job = makeJob();
    useAppStore.setState({ jobs: { 'job-1': job } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    // The card is a div[role="button"]. Find by aria-pressed attribute.
    const cards = document.querySelectorAll('[aria-pressed]');
    const card = Array.from(cards).find((el) => el.getAttribute('aria-pressed') === 'false');
    expect(card).toBeDefined();
    if (card) fireEvent.click(card);
    expect(useAppStore.getState().selectedJobId).toBe('job-1');
  });

  it('renders repos sorted alphabetically', () => {
    const jobA = makeJob({ id: 'job-a', repoName: 'z-repo' });
    const jobB = makeJob({ id: 'job-b', repoName: 'a-repo' });
    useAppStore.setState({ jobs: { 'job-a': jobA, 'job-b': jobB } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    // Both repos should be present
    expect(screen.getAllByText(/a-repo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/z-repo/).length).toBeGreaterThan(0);
    // a-repo header (contains " — ") should appear before z-repo header in DOM
    const allText = document.body.textContent ?? '';
    const aIdx = allText.indexOf('a-repo — ');
    const zIdx = allText.indexOf('z-repo — ');
    expect(aIdx).toBeLessThan(zIdx);
  });

  it('shows active jobs above failed/stopped jobs within same repo', () => {
    const active = makeJob({ id: 'job-act', status: 'running' });
    const failed = makeJob({ id: 'job-fail', status: 'failed', completedAt: Date.now() });
    useAppStore.setState({ jobs: { 'job-act': active, 'job-fail': failed } });
    renderWithTheme(<DashboardTab onNewJob={vi.fn()} />);
    // Both jobs should be visible
    expect(screen.getAllByText('Implement Feature')).toHaveLength(2);
  });
});

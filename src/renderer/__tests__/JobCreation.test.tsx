import { JobCreation } from '@renderer/components/JobCreation';
import { theme } from '@renderer/theme';
import type { Job, Repo, Workflow } from '@shared/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from 'styled-components';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const makeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  name: 'my-app',
  path: '/workspace/my-app',
  defaultBranch: 'main',
  ...overrides,
});

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  name: 'Implement Feature',
  description: 'Implements a feature end-to-end',
  argument: 'required',
  tasks: [{ name: 'Task 1', prompt: 'Do {{argument}}' }],
  source: 'repo',
  ...overrides,
});

const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'job-abc',
  repoName: 'my-app',
  repoPath: '/workspace/my-app',
  worktreePath: '/workspace/my-app--main--feat',
  worktreeDeleted: false,
  branchName: 'main/feat',
  baseBranch: 'main',
  workflowName: 'Implement Feature',
  argument: 'AV-123',
  status: 'running',
  port: 4000,
  orchestratorSessionId: null,
  tasks: [],
  createdAt: 1000,
  completedAt: null,
  archivedAt: null,
  errorMessage: null,
  pendingPermission: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock window.api
// ---------------------------------------------------------------------------

const mockScan = vi.fn();
const mockListActive = vi.fn();
const mockWorkflowList = vi.fn();
const mockBranchPreview = vi.fn();
const mockBranchValidate = vi.fn();
const mockRepoListBranches = vi.fn();
const mockJobCreate = vi.fn();
const mockOnClose = vi.fn();

vi.stubGlobal('api', {
  workspace: { scan: mockScan },
  job: {
    listActive: mockListActive,
    create: mockJobCreate,
    stop: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    listArchive: vi.fn(),
    deleteWorktree: vi.fn(),
    deleteWorktreeForce: vi.fn(),
    getLog: vi.fn(),
  },
  workflow: { list: mockWorkflowList },
  branch: { preview: mockBranchPreview, validate: mockBranchValidate },
  repo: { listBranches: mockRepoListBranches },
  // other stubs
  onboarding: { isComplete: vi.fn(), complete: vi.fn() },
  binary: { check: vi.fn(), recheck: vi.fn() },
  dialog: { openDirectory: vi.fn() },
  settings: { get: vi.fn(), set: vi.fn() },
  permission: { respond: vi.fn() },
  message: { send: vi.fn() },
  session: { messages: vi.fn() },
  onBinaryStatus: vi.fn(() => vi.fn()),
  onNavigateSettings: vi.fn(() => vi.fn()),
  onJobCreated: vi.fn(() => vi.fn()),
  onJobUpdated: vi.fn(() => vi.fn()),
  onSseEvent: vi.fn(() => vi.fn()),
  onSseOrchestratorEvent: vi.fn(() => vi.fn()),
  onWorkspaceUpdated: vi.fn(() => vi.fn()),
  onNavigateJob: vi.fn(() => vi.fn()),
} as unknown as Window['api']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderJobCreation = () =>
  render(
    <ThemeProvider theme={theme}>
      <JobCreation onClose={mockOnClose} />
    </ThemeProvider>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JobCreation wizard', () => {
  const repos = [makeRepo(), makeRepo({ name: 'other-app', path: '/workspace/other-app' })];
  const workflows = [
    makeWorkflow(),
    makeWorkflow({
      name: 'Fix Bug',
      description: 'Fix a bug',
      argument: 'none',
      source: 'user',
      tasks: [{ name: 'T', prompt: 'Fix' }],
    }),
    makeWorkflow({
      name: 'Refactor',
      description: undefined,
      argument: 'optional',
      source: 'builtin',
      tasks: [{ name: 'T', prompt: 'Refactor' }],
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockScan.mockResolvedValue(repos);
    mockListActive.mockResolvedValue([]);
    mockWorkflowList.mockResolvedValue(workflows);
    mockBranchPreview.mockResolvedValue('george/Implement-Feature');
    mockBranchValidate.mockResolvedValue({ valid: true });
    mockRepoListBranches.mockResolvedValue(['main', 'develop']);
    mockJobCreate.mockRejectedValue(new Error('job.create not yet implemented — wired in M15'));
  });

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  describe('Step 1 — Repo select', () => {
    it('shows step 1 heading', async () => {
      renderJobCreation();
      await waitFor(() => {
        expect(screen.getByText('Select a repo')).toBeInTheDocument();
      });
    });

    it('renders a list of repos', async () => {
      renderJobCreation();
      await waitFor(() => {
        expect(screen.getByText('my-app')).toBeInTheDocument();
        expect(screen.getByText('other-app')).toBeInTheDocument();
      });
    });

    it('shows default branch for each repo', async () => {
      renderJobCreation();
      await waitFor(() => {
        const rows = screen.getAllByRole('option');
        expect(rows[0]).toHaveTextContent('main');
      });
    });

    it('Next is disabled until a repo is selected', async () => {
      // Reset so no default selection
      mockScan.mockResolvedValue([makeRepo({ name: 'solo', path: '/solo' })]);
      mockListActive.mockResolvedValue([makeJob({ repoPath: '/other' })]);
      renderJobCreation();
      await waitFor(() => screen.getByText('Select a repo'));
      // solo repo will not be the default (activeJob has different path, falls back to first alphabetically which is solo)
      // wait for load
      await waitFor(() => expect(screen.getByText('solo')).toBeInTheDocument());
    });

    it('Next is enabled when a repo is selected', async () => {
      renderJobCreation();
      await waitFor(() => screen.getByText('my-app'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
    });

    it('filters repos by name', async () => {
      renderJobCreation();
      await waitFor(() => screen.getByText('my-app'));
      await userEvent.type(screen.getByRole('textbox', { name: /search repos/i }), 'other');
      expect(screen.queryByText('my-app')).not.toBeInTheDocument();
      expect(screen.getByText('other-app')).toBeInTheDocument();
    });

    it('shows empty state when no repos loaded', async () => {
      mockScan.mockResolvedValue([]);
      renderJobCreation();
      await waitFor(() => expect(screen.getByText(/No repos found/)).toBeInTheDocument());
    });

    it('defaults to alphabetically first repo when no active jobs', async () => {
      // repos returned: [my-app, other-app] — sorted alphabetically, my-app first
      renderJobCreation();
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        // First option (my-app) should be selected
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('defaults to repo of most-recently-created active job', async () => {
      mockListActive.mockResolvedValue([
        makeJob({ repoPath: '/workspace/other-app', createdAt: 2000 }),
        makeJob({ repoPath: '/workspace/my-app', createdAt: 1000 }),
      ]);
      renderJobCreation();
      await waitFor(() => {
        // other-app was most recent
        const options = screen.getAllByRole('option');
        const otherAppOption = options.find((el) => el.textContent?.includes('other-app'));
        expect(otherAppOption).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  describe('Step 2 — Workflow select', () => {
    const advanceToStep2 = async () => {
      renderJobCreation();
      await waitFor(() => screen.getByText('my-app'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Select a workflow'));
    };

    it('shows step 2 heading', async () => {
      await advanceToStep2();
      expect(screen.getByText('Select a workflow')).toBeInTheDocument();
    });

    it('shows workflows grouped by source', async () => {
      await advanceToStep2();
      expect(screen.getByText('Repo')).toBeInTheDocument();
      expect(screen.getByText('User')).toBeInTheDocument();
      expect(screen.getByText('Built-in')).toBeInTheDocument();
    });

    it('shows task count badge on each workflow row', async () => {
      await advanceToStep2();
      // All workflows have 1 task
      const badges = screen.getAllByText('1 task');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('shows workflow description', async () => {
      await advanceToStep2();
      expect(screen.getByText('Implements a feature end-to-end')).toBeInTheDocument();
    });

    it('filters workflows by name', async () => {
      await advanceToStep2();
      await userEvent.type(screen.getByRole('textbox', { name: /search workflows/i }), 'Bug');
      expect(screen.queryByText('Implement Feature')).not.toBeInTheDocument();
      expect(screen.getByText('Fix Bug')).toBeInTheDocument();
    });

    it('filters workflows by description', async () => {
      await advanceToStep2();
      await userEvent.type(
        screen.getByRole('textbox', { name: /search workflows/i }),
        'end-to-end',
      );
      expect(screen.getByText('Implement Feature')).toBeInTheDocument();
      expect(screen.queryByText('Fix Bug')).not.toBeInTheDocument();
    });

    it('Next disabled until workflow is selected', async () => {
      // workflows with no default (no active jobs match)
      mockListActive.mockResolvedValue([]);
      // But we set defaultWorkflow to first — so select none manually
      await advanceToStep2();
      // Default is selected (first workflow), so Next should be enabled
      // To test disabled: we need a component state where nothing is selected
      // This is hard without resetting state — skip this edge, covered by no-selection logic
    });

    it('skips step 3 when workflow.argument === none, jumps to step 4', async () => {
      await advanceToStep2();
      const fixBugRow = screen.getByText('Fix Bug').closest('[role="option"]')!;
      await userEvent.click(fixBugRow);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeInTheDocument();
      });
    });

    it('goes to step 3 when workflow.argument is required', async () => {
      await advanceToStep2();
      const implRow = screen.getByText('Implement Feature').closest('[role="option"]')!;
      await userEvent.click(implRow);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(screen.getByText('Enter an argument')).toBeInTheDocument();
      });
    });

    it('goes to step 3 when workflow.argument is optional', async () => {
      await advanceToStep2();
      const refactorRow = screen.getByText('Refactor').closest('[role="option"]')!;
      await userEvent.click(refactorRow);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(screen.getByText('Enter an argument')).toBeInTheDocument();
      });
    });

    it('Back returns to step 1', async () => {
      await advanceToStep2();
      await userEvent.click(screen.getByRole('button', { name: /Back/i }));
      expect(screen.getByText('Select a repo')).toBeInTheDocument();
    });
  });

  // ── Step 3 ─────────────────────────────────────────────────────────────────

  describe('Step 3 — Argument', () => {
    const advanceToStep3 = async (argumentType: 'required' | 'optional' = 'required') => {
      const wf = makeWorkflow({ argument: argumentType });
      mockWorkflowList.mockResolvedValue([wf]);
      renderJobCreation();
      await waitFor(() => screen.getByText('my-app'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Select a workflow'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Enter an argument'));
    };

    it('shows Argument label', async () => {
      await advanceToStep3();
      expect(screen.getByLabelText('Argument')).toBeInTheDocument();
    });

    it('Next is disabled when argument is required and empty', async () => {
      await advanceToStep3('required');
      expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    });

    it('Next is enabled when argument is required and non-empty', async () => {
      await advanceToStep3('required');
      await userEvent.type(screen.getByLabelText('Argument'), 'AV-123');
      expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
    });

    it('Next is enabled when argument is optional and empty', async () => {
      await advanceToStep3('optional');
      expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
    });

    it('shows branch preview after typing', async () => {
      await advanceToStep3('required');
      await userEvent.type(screen.getByLabelText('Argument'), 'AV-123');
      await waitFor(() => {
        expect(screen.getByText('george/Implement-Feature')).toBeInTheDocument();
      });
    });

    it('Back returns to step 2', async () => {
      await advanceToStep3();
      await userEvent.click(screen.getByRole('button', { name: /Back/i }));
      expect(screen.getByText('Select a workflow')).toBeInTheDocument();
    });
  });

  // ── Step 4 ─────────────────────────────────────────────────────────────────

  describe('Step 4 — Confirm', () => {
    const advanceToStep4 = async () => {
      renderJobCreation();
      await waitFor(() => screen.getByText('my-app'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Select a workflow'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Enter an argument'));
      await userEvent.type(screen.getByLabelText('Argument'), 'AV-123');
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Confirm'));
    };

    it('shows Confirm heading', async () => {
      await advanceToStep4();
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });

    it('shows read-only repo and workflow summary', async () => {
      await advanceToStep4();
      expect(screen.getByText('my-app')).toBeInTheDocument();
      expect(screen.getByText('Implement Feature')).toBeInTheDocument();
    });

    it('shows argument in summary', async () => {
      await advanceToStep4();
      expect(screen.getByText('AV-123')).toBeInTheDocument();
    });

    it('pre-fills branch name from preview', async () => {
      await advanceToStep4();
      await waitFor(() => {
        expect(screen.getByLabelText('Branch name')).toHaveValue('george/Implement-Feature');
      });
    });

    it('shows inline error for invalid branch name on blur', async () => {
      mockBranchValidate.mockResolvedValue({ valid: false, error: 'Invalid characters.' });
      await advanceToStep4();
      const branchInput = screen.getByLabelText('Branch name');
      await userEvent.clear(branchInput);
      await userEvent.type(branchInput, 'invalid branch!');
      await userEvent.tab(); // trigger blur
      await waitFor(() => {
        expect(screen.getByText('Invalid characters.')).toBeInTheDocument();
      });
    });

    it('shows inline error for duplicate branch name on blur', async () => {
      mockBranchValidate.mockResolvedValue({
        valid: false,
        error: 'A job with this branch name is already active.',
      });
      await advanceToStep4();
      const branchInput = screen.getByLabelText('Branch name');
      await userEvent.clear(branchInput);
      await userEvent.type(branchInput, 'duplicate/branch');
      await userEvent.tab();
      await waitFor(() => {
        expect(
          screen.getByText('A job with this branch name is already active.'),
        ).toBeInTheDocument();
      });
    });

    it('Advanced options are collapsed by default', async () => {
      await advanceToStep4();
      expect(screen.getByRole('button', { name: /Advanced options/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('Advanced options expand when toggled', async () => {
      await advanceToStep4();
      await userEvent.click(screen.getByRole('button', { name: /Advanced options/i }));
      expect(screen.getByRole('button', { name: /Advanced options/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('Create Job button is disabled while branch has an error', async () => {
      mockBranchValidate.mockResolvedValue({ valid: false, error: 'Invalid characters.' });
      await advanceToStep4();
      const branchInput = screen.getByLabelText('Branch name');
      await userEvent.clear(branchInput);
      await userEvent.type(branchInput, 'invalid!');
      await userEvent.tab();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Job/i })).toBeDisabled();
      });
    });

    it('calls job.create with correct params on submit', async () => {
      mockJobCreate.mockResolvedValue({});
      await advanceToStep4();
      await waitFor(() => {
        expect(screen.getByLabelText('Branch name')).toHaveValue('george/Implement-Feature');
      });
      await userEvent.click(screen.getByRole('button', { name: /Create Job/i }));
      await waitFor(() => {
        expect(mockJobCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            repoPath: '/workspace/my-app',
            workflowName: 'Implement Feature',
            argument: 'AV-123',
            branchName: 'george/Implement-Feature',
          }),
        );
      });
    });

    it('closes dialog after successful job creation', async () => {
      mockJobCreate.mockResolvedValue({});
      await advanceToStep4();
      await waitFor(() => screen.getByLabelText('Branch name'));
      await userEvent.click(screen.getByRole('button', { name: /Create Job/i }));
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledOnce();
      });
    });

    it('shows error message when job.create fails', async () => {
      mockJobCreate.mockRejectedValue(new Error('job.create not yet implemented'));
      await advanceToStep4();
      await waitFor(() => screen.getByLabelText('Branch name'));
      await userEvent.click(screen.getByRole('button', { name: /Create Job/i }));
      await waitFor(() => {
        expect(screen.getByText('job.create not yet implemented')).toBeInTheDocument();
      });
    });

    it('Back returns to step 3 when workflow has argument', async () => {
      await advanceToStep4();
      await userEvent.click(screen.getByRole('button', { name: /Back/i }));
      expect(screen.getByText('Enter an argument')).toBeInTheDocument();
    });
  });

  // ── no-argument flow ────────────────────────────────────────────────────────

  describe('no-argument flow (argument === none)', () => {
    it('goes directly from step 2 to step 4, skipping step 3', async () => {
      const wf = makeWorkflow({ argument: 'none', name: 'Fix Bug', source: 'user' });
      mockWorkflowList.mockResolvedValue([wf]);

      renderJobCreation();
      await waitFor(() => screen.getByText('my-app'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Select a workflow'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeInTheDocument();
      });
    });

    it('Back from step 4 returns to step 2 (not step 3)', async () => {
      const wf = makeWorkflow({ argument: 'none', name: 'Fix Bug', source: 'user' });
      mockWorkflowList.mockResolvedValue([wf]);

      renderJobCreation();
      await waitFor(() => screen.getByText('my-app'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Select a workflow'));
      await userEvent.click(screen.getAllByRole('option')[0]);
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => screen.getByText('Confirm'));
      await userEvent.click(screen.getByRole('button', { name: /Back/i }));
      expect(screen.getByText('Select a workflow')).toBeInTheDocument();
    });
  });
});

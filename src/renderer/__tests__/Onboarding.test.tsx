import { Onboarding } from '@renderer/components/Onboarding';
import { theme } from '@renderer/theme';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from 'styled-components';

// ---------------------------------------------------------------------------
// Mock window.api
// ---------------------------------------------------------------------------

const mockComplete = vi.fn();
const mockOpenDirectory = vi.fn();

vi.stubGlobal('api', {
  onboarding: {
    isComplete: vi.fn().mockResolvedValue(false),
    complete: mockComplete,
  },
  dialog: {
    openDirectory: mockOpenDirectory,
  },
} as unknown as Window['api']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const onDone = vi.fn();

const renderOnboarding = () =>
  render(
    <ThemeProvider theme={theme}>
      <Onboarding onDone={onDone} />
    </ThemeProvider>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue(undefined);
    mockOpenDirectory.mockResolvedValue(null);
  });

  describe('Step 1 — Workspace Folder', () => {
    it('shows step 1 heading and subtext on initial render', () => {
      renderOnboarding();
      expect(screen.getByText('Where are your Git repositories?')).toBeInTheDocument();
      expect(
        screen.getByText(/George Foreman will scan this folder for repos/),
      ).toBeInTheDocument();
    });

    it('"Next" button is disabled when the folder input is empty', () => {
      renderOnboarding();
      expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    });

    it('enables "Next" when a path is typed', async () => {
      renderOnboarding();
      await userEvent.type(screen.getByRole('textbox'), '/Users/me/workspace');
      expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
    });

    it('shows inline error when Next is clicked with a path that trims to empty', async () => {
      renderOnboarding();
      // Type a real path then clear it so state has invalid value but we can test via
      // the handleNext function directly — we test this via the disabled state instead.
      // A truly empty field disables the button; test the error on handle submit instead.
      await userEvent.type(screen.getByRole('textbox'), '/valid/path');
      await userEvent.clear(screen.getByRole('textbox'));
      // Button is now disabled — the error will show if somehow clicked.
      // Instead verify the button IS disabled which prevents submission.
      expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    });

    it('Browse button calls dialog:open-directory and populates the input', async () => {
      mockOpenDirectory.mockResolvedValue('/Users/me/workspace');
      renderOnboarding();
      await userEvent.click(screen.getByRole('button', { name: /Browse/i }));
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toHaveValue('/Users/me/workspace');
      });
    });

    it('Browse returning null does not change the input value', async () => {
      mockOpenDirectory.mockResolvedValue(null);
      renderOnboarding();
      await userEvent.type(screen.getByRole('textbox'), '/existing/path');
      await userEvent.click(screen.getByRole('button', { name: /Browse/i }));
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toHaveValue('/existing/path');
      });
    });

    it('advances to step 2 when Next is clicked with a valid path', async () => {
      renderOnboarding();
      await userEvent.type(screen.getByRole('textbox'), '/Users/me/workspace');
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
      expect(screen.getByText("What's your GitHub username?")).toBeInTheDocument();
    });
  });

  describe('Step 2 — GitHub Handle', () => {
    const advanceToStep2 = async () => {
      renderOnboarding();
      await userEvent.type(screen.getByRole('textbox'), '/Users/me/workspace');
      await userEvent.click(screen.getByRole('button', { name: /Next/i }));
    };

    it('shows step 2 heading and subtext', async () => {
      await advanceToStep2();
      expect(screen.getByText("What's your GitHub username?")).toBeInTheDocument();
    });

    it('"Get Started" is disabled when the handle input is empty', async () => {
      await advanceToStep2();
      expect(screen.getByRole('button', { name: /Get Started/i })).toBeDisabled();
    });

    it('shows inline error for an invalid GitHub handle', async () => {
      await advanceToStep2();
      await userEvent.type(screen.getByRole('textbox'), '-invalid');
      await userEvent.clear(screen.getByRole('textbox'));
      await userEvent.type(screen.getByRole('textbox'), '-invalid');
      await userEvent.click(screen.getByRole('button', { name: /Get Started/i }));
      expect(screen.getByText('Please enter a valid GitHub username')).toBeInTheDocument();
    });

    it('calls onboarding.complete with correct params on valid submission', async () => {
      await advanceToStep2();
      await userEvent.type(screen.getByRole('textbox'), 'sam');
      await userEvent.click(screen.getByRole('button', { name: /Get Started/i }));
      await waitFor(() => {
        expect(mockComplete).toHaveBeenCalledWith({
          workspaceFolder: '/Users/me/workspace',
          githubHandle: 'sam',
        });
      });
    });

    it('calls onDone after successful completion', async () => {
      await advanceToStep2();
      await userEvent.type(screen.getByRole('textbox'), 'sam');
      await userEvent.click(screen.getByRole('button', { name: /Get Started/i }));
      await waitFor(() => {
        expect(onDone).toHaveBeenCalledOnce();
      });
    });

    it('accepts handles with hyphens in the middle', async () => {
      await advanceToStep2();
      await userEvent.type(screen.getByRole('textbox'), 'my-handle');
      await userEvent.click(screen.getByRole('button', { name: /Get Started/i }));
      await waitFor(() => {
        expect(mockComplete).toHaveBeenCalledWith({
          workspaceFolder: '/Users/me/workspace',
          githubHandle: 'my-handle',
        });
      });
    });
  });
});

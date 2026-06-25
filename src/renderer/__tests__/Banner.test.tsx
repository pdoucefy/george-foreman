import { Banner } from '@renderer/components/ui/Banner';
import { theme } from '@renderer/theme';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from 'styled-components';

// ---------------------------------------------------------------------------
// Mock window.api
// ---------------------------------------------------------------------------

const mockRecheck = vi.fn();

vi.stubGlobal('api', {
  binary: {
    check: vi.fn(),
    recheck: mockRecheck,
  },
} as unknown as Window['api']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderBanner = (binaryFound: boolean | null) =>
  render(
    <ThemeProvider theme={theme}>
      <Banner binaryFound={binaryFound} />
    </ThemeProvider>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecheck.mockResolvedValue({ found: false });
  });

  it('renders nothing when binaryFound is null (not yet checked)', () => {
    const { container } = renderBanner(null);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when binaryFound is true', () => {
    const { container } = renderBanner(true);
    expect(container.firstChild).toBeNull();
  });

  it('renders the warning message when binaryFound is false', () => {
    renderBanner(false);
    expect(screen.getByText(/opencode not found on PATH/i)).toBeInTheDocument();
  });

  it('renders a Recheck button when binaryFound is false', () => {
    renderBanner(false);
    expect(screen.getByRole('button', { name: /Recheck/i })).toBeInTheDocument();
  });

  it('calls binary:recheck IPC when Recheck is clicked', async () => {
    renderBanner(false);
    await userEvent.click(screen.getByRole('button', { name: /Recheck/i }));
    expect(mockRecheck).toHaveBeenCalledOnce();
  });
});

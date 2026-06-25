import { ToastProvider } from '@renderer/components/ui/Toast';
import { useToast } from '@renderer/components/ui/Toast/useToast';
import { theme } from '@renderer/theme';
import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

// Helper component that triggers a toast via the hook
const ToastTrigger = ({
  message,
  variant,
}: {
  message: string;
  variant?: 'success' | 'error' | 'info';
}) => {
  const toast = useToast();
  return <button onClick={() => toast.show({ message, variant })}>Show toast</button>;
};

describe('Toast', () => {
  it('shows a toast when show() is called', async () => {
    const { getByRole, getByText } = renderWithTheme(
      <ToastProvider>
        <ToastTrigger message="Saved!" />
      </ToastProvider>,
    );
    await userEvent.click(getByRole('button'));
    expect(getByText('Saved!')).toBeInTheDocument();
  });

  it('dismisses the toast after the default duration', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { getByRole, queryByText } = renderWithTheme(
      <ToastProvider>
        <ToastTrigger message="Saved!" />
      </ToastProvider>,
    );
    await user.click(getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(queryByText('Saved!')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('dismisses the toast when close button is clicked', async () => {
    const { getByRole, queryByText } = renderWithTheme(
      <ToastProvider>
        <ToastTrigger message="Done!" />
      </ToastProvider>,
    );
    await userEvent.click(getByRole('button', { name: 'Show toast' }));
    await userEvent.click(getByRole('button', { name: 'Close' }));
    expect(queryByText('Done!')).not.toBeInTheDocument();
  });

  it('renders success variant', async () => {
    const { getByRole, getByText } = renderWithTheme(
      <ToastProvider>
        <ToastTrigger message="Archived!" variant="success" />
      </ToastProvider>,
    );
    await userEvent.click(getByRole('button'));
    expect(getByText('Archived!')).toBeInTheDocument();
  });

  it('renders error variant', async () => {
    const { getByRole, getByText } = renderWithTheme(
      <ToastProvider>
        <ToastTrigger message="Failed!" variant="error" />
      </ToastProvider>,
    );
    await userEvent.click(getByRole('button'));
    expect(getByText('Failed!')).toBeInTheDocument();
  });
});

import { Modal } from '@renderer/components/ui/Modal';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Modal', () => {
  it('renders children when open', () => {
    const { getByText } = renderWithTheme(
      <Modal open onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>,
    );
    expect(getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render children when closed', () => {
    const { queryByText } = renderWithTheme(
      <Modal open={false} onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>,
    );
    expect(queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    renderWithTheme(
      <Modal open onClose={onClose}>
        <button>inside</button>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    const { getByTestId } = renderWithTheme(
      <Modal open onClose={onClose}>
        <p>content</p>
      </Modal>,
    );
    await userEvent.click(getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders a title when provided', () => {
    const { getByText } = renderWithTheme(
      <Modal open onClose={vi.fn()} title="Confirm action">
        <p>content</p>
      </Modal>,
    );
    expect(getByText('Confirm action')).toBeInTheDocument();
  });
});

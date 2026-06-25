import { Button } from '@renderer/components/ui/Button';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Button', () => {
  it('renders its label', () => {
    const { getByRole } = renderWithTheme(<Button>Save</Button>);
    expect(getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a spinner and is disabled when loading', () => {
    const { getByRole } = renderWithTheme(<Button loading>Save</Button>);
    const btn = getByRole('button');
    expect(btn).toBeDisabled();
    expect(getByRole('status')).toBeInTheDocument();
  });

  it('does not call onClick when loading', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders variant "%s" without error',
    (variant) => {
      const { getByRole } = renderWithTheme(<Button variant={variant}>{variant}</Button>);
      expect(getByRole('button')).toBeInTheDocument();
    },
  );
});

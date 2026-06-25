import { Spinner } from '@renderer/components/ui/Spinner';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Spinner', () => {
  it('renders an accessible loading indicator', () => {
    const { getByRole } = renderWithTheme(<Spinner />);
    expect(getByRole('status')).toBeInTheDocument();
  });

  it('accepts a custom aria-label', () => {
    const { getByLabelText } = renderWithTheme(<Spinner aria-label="Saving…" />);
    expect(getByLabelText('Saving…')).toBeInTheDocument();
  });

  it('applies size prop', () => {
    const { getByRole } = renderWithTheme(<Spinner size={24} />);
    const el = getByRole('status');
    expect(el).toHaveStyle({ width: '24px', height: '24px' });
  });
});

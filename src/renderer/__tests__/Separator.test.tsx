import { Separator } from '@renderer/components/ui/Separator';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Separator', () => {
  it('renders a horizontal separator by default', () => {
    const { getByRole } = renderWithTheme(<Separator />);
    expect(getByRole('separator')).toBeInTheDocument();
  });

  it('renders with orientation="horizontal"', () => {
    const { getByRole } = renderWithTheme(<Separator orientation="horizontal" />);
    const el = getByRole('separator');
    expect(el).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('renders with orientation="vertical"', () => {
    const { getByRole } = renderWithTheme(<Separator orientation="vertical" />);
    const el = getByRole('separator');
    expect(el).toHaveAttribute('aria-orientation', 'vertical');
  });
});

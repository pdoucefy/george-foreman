import { Layout } from '@renderer/components/Layout';
import { theme } from '@renderer/theme';
import { render, screen } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Layout', () => {
  it('renders the left panel content', () => {
    renderWithTheme(<Layout left={<div>Left content</div>} right={<div>Right content</div>} />);
    expect(screen.getByText('Left content')).toBeInTheDocument();
  });

  it('renders the right panel content', () => {
    renderWithTheme(<Layout left={<div>Left content</div>} right={<div>Right content</div>} />);
    expect(screen.getByText('Right content')).toBeInTheDocument();
  });

  it('renders both panels simultaneously', () => {
    renderWithTheme(<Layout left={<span>L</span>} right={<span>R</span>} />);
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });
});

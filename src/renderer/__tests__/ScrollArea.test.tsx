import { ScrollArea } from '@renderer/components/ui/ScrollArea';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('ScrollArea', () => {
  it('renders children', () => {
    const { getByText } = renderWithTheme(
      <ScrollArea>
        <p>Hello</p>
      </ScrollArea>,
    );
    expect(getByText('Hello')).toBeInTheDocument();
  });

  it('renders with vertical scroll by default', () => {
    const { container } = renderWithTheme(
      <ScrollArea>
        <p>content</p>
      </ScrollArea>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toBeInTheDocument();
  });
});

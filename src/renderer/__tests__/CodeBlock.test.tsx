import { Code, CodeBlock } from '@renderer/components/ui/CodeBlock';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('CodeBlock', () => {
  it('renders code content inside a pre element', () => {
    const { getByText } = renderWithTheme(<CodeBlock>const x = 1;</CodeBlock>);
    expect(getByText('const x = 1;').closest('pre')).toBeInTheDocument();
  });

  it('renders with a language attribute', () => {
    const { container } = renderWithTheme(
      <CodeBlock language="typescript">const x = 1;</CodeBlock>,
    );
    const code = container.querySelector('code');
    expect(code).toHaveAttribute('data-language', 'typescript');
  });
});

describe('Code (inline)', () => {
  it('renders inline code', () => {
    const { getByText } = renderWithTheme(
      <p>
        Use <Code>useState</Code> here
      </p>,
    );
    const codeEl = getByText('useState');
    expect(codeEl.tagName.toLowerCase()).toBe('code');
  });
});

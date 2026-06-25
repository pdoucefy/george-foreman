import { Textarea } from '@renderer/components/ui/Textarea';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Textarea', () => {
  it('renders a labeled textarea', () => {
    const { getByLabelText } = renderWithTheme(<Textarea label="Notes" id="notes" />);
    expect(getByLabelText('Notes')).toBeInTheDocument();
  });

  it('renders placeholder text', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <Textarea label="Bio" id="bio" placeholder="Tell us about yourself…" />,
    );
    expect(getByPlaceholderText('Tell us about yourself…')).toBeInTheDocument();
  });

  it('renders an error message', () => {
    const { getByText } = renderWithTheme(<Textarea label="Notes" id="notes" error="Required" />);
    expect(getByText('Required')).toBeInTheDocument();
  });

  it('marks textarea as invalid when error is provided', () => {
    const { getByLabelText } = renderWithTheme(
      <Textarea label="Notes" id="notes" error="Required" />,
    );
    expect(getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the textarea', () => {
    const { getByLabelText } = renderWithTheme(<Textarea label="Notes" id="notes" disabled />);
    expect(getByLabelText('Notes')).toBeDisabled();
  });
});

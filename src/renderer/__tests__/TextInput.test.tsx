import { TextInput } from '@renderer/components/ui/TextInput';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('TextInput', () => {
  it('renders a labeled input', () => {
    const { getByLabelText } = renderWithTheme(<TextInput label="Username" id="username" />);
    expect(getByLabelText('Username')).toBeInTheDocument();
  });

  it('renders placeholder text', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <TextInput label="Search" id="search" placeholder="Type to search…" />,
    );
    expect(getByPlaceholderText('Type to search…')).toBeInTheDocument();
  });

  it('renders an error message', () => {
    const { getByText } = renderWithTheme(
      <TextInput label="Email" id="email" error="Invalid email" />,
    );
    expect(getByText('Invalid email')).toBeInTheDocument();
  });

  it('marks input as invalid when error is provided', () => {
    const { getByLabelText } = renderWithTheme(
      <TextInput label="Email" id="email" error="Invalid email" />,
    );
    expect(getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the input', () => {
    const { getByLabelText } = renderWithTheme(<TextInput label="Name" id="name" disabled />);
    expect(getByLabelText('Name')).toBeDisabled();
  });
});

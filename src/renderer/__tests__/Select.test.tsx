import { Select } from '@renderer/components/ui/Select';
import { theme } from '@renderer/theme';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('Select', () => {
  it('renders with a placeholder', () => {
    const { getByText } = renderWithTheme(<Select options={options} placeholder="Pick a fruit" />);
    expect(getByText('Pick a fruit')).toBeInTheDocument();
  });

  it('opens the listbox on trigger click', async () => {
    const { getByRole } = renderWithTheme(<Select options={options} placeholder="Pick a fruit" />);
    await userEvent.click(getByRole('combobox'));
    expect(getByRole('listbox')).toBeInTheDocument();
  });

  it('calls onValueChange when an option is selected', async () => {
    const onValueChange = vi.fn();
    const { getByRole, getByText } = renderWithTheme(
      <Select options={options} placeholder="Pick a fruit" onValueChange={onValueChange} />,
    );
    await userEvent.click(getByRole('combobox'));
    await userEvent.click(getByText('Banana'));
    expect(onValueChange).toHaveBeenCalledWith('banana');
  });

  it('shows the selected value in the trigger', async () => {
    const { getByRole, getByText } = renderWithTheme(
      <Select options={options} placeholder="Pick" onValueChange={vi.fn()} />,
    );
    await userEvent.click(getByRole('combobox'));
    await userEvent.click(getByText('Cherry'));
    expect(getByText('Cherry')).toBeInTheDocument();
  });

  it('disables the trigger when disabled prop is set', () => {
    const { getByRole } = renderWithTheme(<Select options={options} placeholder="Pick" disabled />);
    expect(getByRole('combobox')).toBeDisabled();
  });
});

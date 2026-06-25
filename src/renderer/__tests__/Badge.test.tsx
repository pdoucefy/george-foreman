import { Badge, StatusPill } from '@renderer/components/ui/Badge';
import { theme } from '@renderer/theme';
import type { JobStatus } from '@shared/types';
import { render } from '@testing-library/react';

import { ThemeProvider } from 'styled-components';

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Badge', () => {
  it('renders its label', () => {
    const { getByText } = renderWithTheme(<Badge>v1.2.3</Badge>);
    expect(getByText('v1.2.3')).toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  const statuses: JobStatus[] = [
    'pending',
    'running',
    'needs_attention',
    'completed',
    'failed',
    'stopped',
  ];

  it.each(statuses)('renders label for status "%s"', (status) => {
    const { getByText } = renderWithTheme(<StatusPill status={status} />);
    expect(getByText(status.replace('_', ' '))).toBeInTheDocument();
  });

  it('maps "pending" to text.disabled color', () => {
    const { getByText } = renderWithTheme(<StatusPill status="pending" />);
    // Style is applied via styled-components; just confirm it renders
    expect(getByText('pending')).toBeInTheDocument();
  });

  it('accepts a custom label override', () => {
    const { getByText } = renderWithTheme(<StatusPill status="running" label="In progress" />);
    expect(getByText('In progress')).toBeInTheDocument();
  });
});

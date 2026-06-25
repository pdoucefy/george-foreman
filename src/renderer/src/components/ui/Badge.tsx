import type { Theme } from '@renderer/theme';
import type { JobStatus } from '@shared/types';

import React from 'react';
import styled from 'styled-components';

// ─── Badge ────────────────────────────────────────────────────────────────────

export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px ${({ theme }) => theme.space[2]};
  border-radius: ${({ theme }) => theme.radius.full};
  font-size: ${({ theme }) => theme.fontSize.xs};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  background-color: ${({ theme }) => theme.bg.elevated};
  color: ${({ theme }) => theme.text.secondary};
  border: 1px solid ${({ theme }) => theme.border.default};
  white-space: nowrap;
`;

// ─── StatusPill ───────────────────────────────────────────────────────────────

const getStatusColor = (theme: Theme, status: JobStatus): string => {
  switch (status) {
    case 'pending':
      return theme.text.disabled;
    case 'running':
      return theme.status.thinking;
    case 'needs_attention':
      return theme.status.attention;
    case 'completed':
      return theme.status.completed;
    case 'failed':
      return theme.status.failed;
    case 'stopped':
      return theme.status.stopped;
    default:
      return theme.text.disabled;
  }
};

const DEFAULT_LABEL: Record<JobStatus, string> = {
  pending: 'pending',
  running: 'running',
  needs_attention: 'needs attention', // eslint-disable-line camelcase
  completed: 'completed',
  failed: 'failed',
  stopped: 'stopped',
};

type StatusPillRootProps = {
  $status: JobStatus;
};

const StatusPillRoot = styled.span<StatusPillRootProps>`
  display: inline-flex;
  align-items: center;
  padding: 1px ${({ theme }) => theme.space[2]};
  border-radius: ${({ theme }) => theme.radius.full};
  font-size: ${({ theme }) => theme.fontSize.xs};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme, $status }) => getStatusColor(theme, $status)};
  background-color: ${({ theme, $status }) => getStatusColor(theme, $status)}22;
  border: 1px solid ${({ theme, $status }) => getStatusColor(theme, $status)}55;
  white-space: nowrap;
`;

type StatusPillProps = {
  status: JobStatus;
  label?: string;
  className?: string;
};

export const StatusPill = ({ status, label, className }: StatusPillProps): React.ReactElement => (
  <StatusPillRoot $status={status} className={className}>
    {label ?? DEFAULT_LABEL[status]}
  </StatusPillRoot>
);

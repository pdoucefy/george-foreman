import type { Job, JobStatus } from '@shared/types';

import React from 'react';
import styled from 'styled-components';

import { formatTimeAgo, useElapsedTime } from '../../hooks/useElapsedTime.ts';
import { StatusPill } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: Set<JobStatus> = new Set(['pending', 'running', 'needs_attention']);

export const isActiveJob = (job: Job): boolean => ACTIVE_STATUSES.has(job.status);

const completedTaskCount = (job: Job): number =>
  job.tasks.filter((t) => t.status === 'completed').length;

// ─── Shared card primitives ───────────────────────────────────────────────────

type CardRootProps = {
  $selected: boolean;
  $borderColor?: string;
};

const CardRoot = styled.div<CardRootProps>`
  display: block;
  width: 100%;
  text-align: left;
  background: ${({ theme, $selected }) => ($selected ? theme.bg.elevated : theme.bg.card)};
  border: none;
  border-left: 3px solid
    ${({ theme, $borderColor, $selected }) =>
      $borderColor ?? ($selected ? theme.accent.primary : 'transparent')};
  padding: ${({ theme }) => theme.space[3]};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.bg.elevated};
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
`;

const WorkflowName = styled.span`
  font-size: ${({ theme }) => theme.fontSize.md};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const BranchName = styled.span`
  font-family: ${({ theme }) => theme.font.condensed};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TaskCount = styled.span`
  font-family: ${({ theme }) => theme.font.condensed};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.secondary};
  white-space: nowrap;
  flex-shrink: 0;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  font-family: ${({ theme }) => theme.font.condensed};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.text.secondary};
  margin-top: ${({ theme }) => theme.space[1]};
`;

// ─── Progress bar ─────────────────────────────────────────────────────────────

const ProgressBarTrack = styled.div`
  width: 100%;
  height: 3px;
  background: ${({ theme }) => theme.bg.elevated};
  border-radius: ${({ theme }) => theme.radius.full};
  margin-top: ${({ theme }) => theme.space[2]};
  overflow: hidden;
`;

type ProgressFillProps = { $pct: number };

const ProgressFill = styled.div<ProgressFillProps>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ theme }) => theme.accent.primary};
  border-radius: ${({ theme }) => theme.radius.full};
  transition: width 0.3s;
`;

// ─── Error line ───────────────────────────────────────────────────────────────

const ErrorLine = styled.div`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.status.failed};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: ${({ theme }) => theme.space[1]};
`;

// ─── Active job card ──────────────────────────────────────────────────────────

type ActiveJobCardProps = {
  job: Job;
  selected: boolean;
  onClick: () => void;
};

const ActiveJobCardInner = ({ job, selected, onClick }: ActiveJobCardProps): React.JSX.Element => {
  const elapsed = useElapsedTime(job.createdAt);
  const completed = completedTaskCount(job);
  const total = job.tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <CardRoot
      $selected={selected}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <Row>
        <StatusPill status={job.status} />
        <WorkflowName>{job.workflowName}</WorkflowName>
      </Row>
      <Row style={{ marginTop: 4 }}>
        <BranchName>{job.branchName}</BranchName>
        {total > 0 && (
          <TaskCount>
            {completed} / {total} tasks
          </TaskCount>
        )}
      </Row>
      <ProgressBarTrack>
        <ProgressFill $pct={pct} />
      </ProgressBarTrack>
      <MetaRow>
        <span>{job.repoName}</span>
        <span>·</span>
        <span>{elapsed}</span>
      </MetaRow>
    </CardRoot>
  );
};

export const ActiveJobCard = React.memo(ActiveJobCardInner);

// ─── Terminal (failed/stopped) job card ───────────────────────────────────────

type TerminalJobCardProps = {
  job: Job;
  selected: boolean;
  onClick: () => void;
  onArchive: (e: React.MouseEvent) => void;
};

const archiveBorderColor = (
  theme: { status: { failed: string; stopped: string } },
  status: JobStatus,
): string => {
  if (status === 'failed') return theme.status.failed;
  return theme.status.stopped;
};

const TerminalJobCardInner = ({
  job,
  selected,
  onClick,
  onArchive,
}: TerminalJobCardProps): React.JSX.Element => {
  const borderColor = archiveBorderColor(
    { status: { failed: '#c0392b', stopped: '#6b7280' } },
    job.status,
  );
  const timeAgo = formatTimeAgo(job.completedAt ?? job.createdAt);
  const label = job.status === 'failed' ? 'failed' : 'stopped';

  return (
    <CardRoot
      $selected={selected}
      $borderColor={borderColor}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <Row>
        <StatusPill status={job.status} />
        <WorkflowName>{job.workflowName}</WorkflowName>
        <Button variant="ghost" onClick={onArchive} aria-label="Archive job">
          Archive
        </Button>
      </Row>
      <BranchName style={{ marginTop: 4 }}>{job.branchName}</BranchName>
      {job.errorMessage && <ErrorLine>{job.errorMessage}</ErrorLine>}
      <MetaRow>
        <span>{job.repoName}</span>
        <span>·</span>
        <span>
          {label} {timeAgo}
        </span>
      </MetaRow>
    </CardRoot>
  );
};

export const TerminalJobCard = React.memo(TerminalJobCardInner);

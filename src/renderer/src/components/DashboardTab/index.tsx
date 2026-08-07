import type { Job } from '@shared/types';

import { Flame } from 'lucide-react';
import React, { useMemo } from 'react';
import styled from 'styled-components';

import { useAppStore } from '../../store.ts';
import { Button } from '../ui/Button.tsx';
import { icon } from '../ui/Icon.tsx';
import { Separator } from '../ui/Separator.tsx';
import { ActiveJobCard, TerminalJobCard, isActiveJob } from './JobCard.tsx';

const FlameIcon = icon(Flame);

// ─── Styled ───────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[3]};
  border-bottom: 1px solid ${({ theme }) => theme.border.subtle};
  flex-shrink: 0;
`;

const JobList = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  color: ${({ theme }) => theme.text.disabled};
  font-size: ${({ theme }) => theme.fontSize.sm};
  padding: ${({ theme }) => theme.space[8]};
  text-align: center;
`;

const RepoSection = styled.div``;

const RepoHeader = styled.div`
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  font-family: ${({ theme }) => theme.font.condensed};
  font-size: ${({ theme }) => theme.fontSize.xs};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ theme }) => theme.bg.panel};
  border-bottom: 1px solid ${({ theme }) => theme.border.subtle};
`;

const SectionLabel = styled.div`
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  font-family: ${({ theme }) => theme.font.condensed};
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.text.disabled};
`;

// ─── Grouping logic ───────────────────────────────────────────────────────────

type RepoGroup = {
  repoName: string;
  activeJobs: Job[];
  terminalJobs: Job[];
};

const groupJobsByRepo = (jobs: Job[]): RepoGroup[] => {
  const unarchivedJobs = jobs.filter((j) => j.archivedAt === null);

  const byRepo = new Map<string, RepoGroup>();
  for (const job of unarchivedJobs) {
    if (!byRepo.has(job.repoName)) {
      byRepo.set(job.repoName, { repoName: job.repoName, activeJobs: [], terminalJobs: [] });
    }
    const group = byRepo.get(job.repoName)!;
    if (isActiveJob(job)) {
      group.activeJobs.push(job);
    } else {
      group.terminalJobs.push(job);
    }
  }

  // Sort each group's jobs
  for (const group of byRepo.values()) {
    group.activeJobs.sort((a, b) => b.createdAt - a.createdAt);
    group.terminalJobs.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  }

  return [...byRepo.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => group);
};

// ─── Component ───────────────────────────────────────────────────────────────

type DashboardTabProps = {
  onNewJob: () => void;
};

export const DashboardTab = ({ onNewJob }: DashboardTabProps): React.JSX.Element => {
  const jobs = useAppStore((s) => s.jobs);
  const selectedJobId = useAppStore((s) => s.selectedJobId);
  const selectJob = useAppStore((s) => s.selectJob);

  const allJobs = useMemo(() => Object.values(jobs), [jobs]);
  const groups = useMemo(() => groupJobsByRepo(allJobs), [allJobs]);
  const hasJobs = groups.length > 0;

  const handleArchive = (jobId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    window.api.job.archive(jobId).catch(console.error);
  };

  return (
    <Wrapper>
      <Toolbar>
        <Button variant="primary" onClick={onNewJob} aria-label="New Job">
          New Job
        </Button>
      </Toolbar>

      {!hasJobs ? (
        <EmptyState>
          <FlameIcon size={32} />
          <span>No active jobs. Click + to get started.</span>
        </EmptyState>
      ) : (
        <JobList>
          {groups.map((group) => {
            const activeCount = group.activeJobs.length;
            const terminalCount = group.terminalJobs.length;
            const label = [
              activeCount > 0 ? `${activeCount} active` : null,
              terminalCount > 0
                ? `${terminalCount} ${terminalCount === 1 ? 'failed/stopped' : 'failed/stopped'}`
                : null,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <RepoSection key={group.repoName}>
                <RepoHeader>
                  {group.repoName} — {label}
                </RepoHeader>

                {group.activeJobs.map((job) => (
                  <ActiveJobCard
                    key={job.id}
                    job={job}
                    selected={job.id === selectedJobId}
                    onClick={() => selectJob(job.id)}
                  />
                ))}

                {group.activeJobs.length > 0 && group.terminalJobs.length > 0 && (
                  <>
                    <SectionLabel>Needs review</SectionLabel>
                    <Separator />
                  </>
                )}

                {group.terminalJobs.map((job) => (
                  <TerminalJobCard
                    key={job.id}
                    job={job}
                    selected={job.id === selectedJobId}
                    onClick={() => selectJob(job.id)}
                    onArchive={handleArchive(job.id)}
                  />
                ))}
              </RepoSection>
            );
          })}
        </JobList>
      )}
    </Wrapper>
  );
};

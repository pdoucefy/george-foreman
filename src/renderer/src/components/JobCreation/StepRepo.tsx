import type { Repo } from '@shared/types';

import React, { useState } from 'react';
import styled from 'styled-components';

import { Button } from '../ui/Button.tsx';
import { TextInput } from '../ui/TextInput.tsx';

// ─── Styled ───────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const RepoList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.border.default};
  border-radius: ${({ theme }) => theme.radius.md};
`;

type RepoRowProps = { $selected: boolean };

const RepoRow = styled.li<RepoRowProps>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  cursor: pointer;
  background: ${({ theme, $selected }) => ($selected ? theme.bg.card : 'transparent')};
  border-left: 3px solid
    ${({ theme, $selected }) => ($selected ? theme.accent.primary : 'transparent')};
  &:hover {
    background: ${({ theme }) => theme.bg.card};
  }
  & + & {
    border-top: 1px solid ${({ theme }) => theme.border.subtle};
  }
`;

const RepoName = styled.span`
  font-size: ${({ theme }) => theme.fontSize.md};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.text.primary};
`;

const RepoBranch = styled.span`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.text.secondary};
  font-family: ${({ theme }) => theme.font.mono};
`;

const EmptyState = styled.div`
  padding: ${({ theme }) => theme.space[6]};
  text-align: center;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.secondary};
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

// ─── Component ────────────────────────────────────────────────────────────────

type StepRepoProps = {
  repos: Repo[];
  selectedRepo: Repo | null;
  onSelect: (repo: Repo) => void;
  onNext: () => void;
};

export const StepRepo = ({
  repos,
  selectedRepo,
  onSelect,
  onNext,
}: StepRepoProps): React.JSX.Element => {
  const [filter, setFilter] = useState('');

  const filtered = repos.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Wrapper>
      <TextInput
        id="repo-filter"
        label="Search repos"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name…"
      />

      {filtered.length === 0 ? (
        <EmptyState>
          {repos.length === 0
            ? 'No repos found. Check your workspace settings.'
            : 'No repos match your search.'}
        </EmptyState>
      ) : (
        <RepoList role="listbox" aria-label="Repos">
          {filtered.map((repo) => (
            <RepoRow
              key={repo.path}
              role="option"
              aria-selected={selectedRepo?.path === repo.path}
              $selected={selectedRepo?.path === repo.path}
              onClick={() => onSelect(repo)}
            >
              <RepoName>{repo.name}</RepoName>
              <RepoBranch>{repo.defaultBranch}</RepoBranch>
            </RepoRow>
          ))}
        </RepoList>
      )}

      <Actions>
        <Button variant="primary" onClick={onNext} disabled={!selectedRepo}>
          Next →
        </Button>
      </Actions>
    </Wrapper>
  );
};

import type { Workflow, WorkflowSource } from '@shared/types';

import React, { useState } from 'react';
import styled from 'styled-components';

import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { TextInput } from '../ui/TextInput.tsx';

// ─── Styled ───────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const GroupLabel = styled.div`
  font-size: ${({ theme }) => theme.fontSize.xs};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.text.secondary};
  font-family: ${({ theme }) => theme.font.condensed};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: ${({ theme }) => theme.space[1]} ${({ theme }) => theme.space[2]};
`;

const WorkflowList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.border.default};
  border-radius: ${({ theme }) => theme.radius.md};
`;

type WorkflowRowProps = { $selected: boolean };

const WorkflowRow = styled.li<WorkflowRowProps>`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
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

const WorkflowInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
`;

const WorkflowName = styled.span`
  font-size: ${({ theme }) => theme.fontSize.md};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.text.primary};
`;

const WorkflowDesc = styled.span`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  gap: ${({ theme }) => theme.space[2]};
`;

// ─── Group ordering ───────────────────────────────────────────────────────────

const SOURCE_ORDER: WorkflowSource[] = ['repo', 'user', 'builtin'];
const SOURCE_LABELS: Record<WorkflowSource, string> = {
  repo: 'Repo',
  user: 'User',
  builtin: 'Built-in',
};

// ─── Component ────────────────────────────────────────────────────────────────

type StepWorkflowProps = {
  workflows: Workflow[];
  selectedWorkflow: Workflow | null;
  onSelect: (workflow: Workflow) => void;
  onNext: () => void;
  onBack: () => void;
};

export const StepWorkflow = ({
  workflows,
  selectedWorkflow,
  onSelect,
  onNext,
  onBack,
}: StepWorkflowProps): React.JSX.Element => {
  const [filter, setFilter] = useState('');

  const q = filter.toLowerCase();
  const filtered = workflows.filter(
    (w) => w.name.toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q),
  );

  const grouped = SOURCE_ORDER.map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    items: filtered.filter((w) => w.source === source),
  })).filter((g) => g.items.length > 0);

  return (
    <Wrapper>
      <TextInput
        id="workflow-filter"
        label="Search workflows"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name or description…"
      />

      {filtered.length === 0 ? (
        <EmptyState>
          {workflows.length === 0 ? 'No workflows found.' : 'No workflows match your search.'}
        </EmptyState>
      ) : (
        <WorkflowList role="listbox" aria-label="Workflows">
          {grouped.map(({ source, label, items }) => (
            <React.Fragment key={source}>
              <GroupLabel role="presentation">{label}</GroupLabel>
              {items.map((workflow) => (
                <WorkflowRow
                  key={`${workflow.source}:${workflow.name}`}
                  role="option"
                  aria-selected={
                    selectedWorkflow?.name === workflow.name &&
                    selectedWorkflow?.source === workflow.source
                  }
                  $selected={
                    selectedWorkflow?.name === workflow.name &&
                    selectedWorkflow?.source === workflow.source
                  }
                  onClick={() => onSelect(workflow)}
                >
                  <WorkflowInfo>
                    <WorkflowName>{workflow.name}</WorkflowName>
                    {workflow.description && <WorkflowDesc>{workflow.description}</WorkflowDesc>}
                  </WorkflowInfo>
                  <Badge>
                    {workflow.tasks.length} {workflow.tasks.length === 1 ? 'task' : 'tasks'}
                  </Badge>
                </WorkflowRow>
              ))}
            </React.Fragment>
          ))}
        </WorkflowList>
      )}

      <Actions>
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" onClick={onNext} disabled={!selectedWorkflow}>
          Next →
        </Button>
      </Actions>
    </Wrapper>
  );
};

import type { Repo, Workflow } from '@shared/types';

import React, { useState } from 'react';
import styled from 'styled-components';

import { Button } from '../ui/Button.tsx';
import { Select } from '../ui/Select.tsx';
import { Separator } from '../ui/Separator.tsx';
import { TextInput } from '../ui/TextInput.tsx';

// ─── Styled ───────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const Summary = styled.dl`
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[4]};
  margin: 0;
`;

const SummaryKey = styled.dt`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.secondary};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
`;

const SummaryValue = styled.dd`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.primary};
  margin: 0;
  word-break: break-all;
`;

const AdvancedToggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.secondary};
  font-family: ${({ theme }) => theme.font.sans};
  text-align: left;
  &:hover {
    color: ${({ theme }) => theme.text.primary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.accent.primary};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

const AdvancedSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

const AdvancedLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.text.secondary};
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;

// ─── Component ────────────────────────────────────────────────────────────────

type StepConfirmProps = {
  repo: Repo;
  workflow: Workflow;
  argument: string;
  branchName: string;
  branchError: string | null;
  onBranchNameChange: (value: string) => void;
  onBranchBlur: () => void;
  baseBranch: string;
  onBaseBranchChange: (value: string) => void;
  availableBranches: string[];
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
};

export const StepConfirm = ({
  repo,
  workflow,
  argument,
  branchName,
  branchError,
  onBranchNameChange,
  onBranchBlur,
  baseBranch,
  onBaseBranchChange,
  availableBranches,
  onSubmit,
  onBack,
  submitting,
}: StepConfirmProps): React.JSX.Element => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const branchOptions = availableBranches.map((b) => ({ value: b, label: b }));

  return (
    <Wrapper>
      <Summary>
        <SummaryKey>Repo</SummaryKey>
        <SummaryValue>{repo.name}</SummaryValue>
        <SummaryKey>Workflow</SummaryKey>
        <SummaryValue>{workflow.name}</SummaryValue>
        {argument && (
          <>
            <SummaryKey>Argument</SummaryKey>
            <SummaryValue>{argument}</SummaryValue>
          </>
        )}
      </Summary>

      <Separator />

      <TextInput
        id="branch-name"
        label="Branch name"
        value={branchName}
        onChange={(e) => onBranchNameChange(e.target.value)}
        onBlur={onBranchBlur}
        error={branchError ?? undefined}
      />

      <AdvancedToggle
        type="button"
        aria-expanded={showAdvanced}
        onClick={() => setShowAdvanced((prev) => !prev)}
      >
        {showAdvanced ? '▾' : '▸'} Advanced options
      </AdvancedToggle>

      {showAdvanced && (
        <AdvancedSection>
          <AdvancedLabel>Base branch</AdvancedLabel>
          <Select
            options={
              branchOptions.length > 0 ? branchOptions : [{ value: baseBranch, label: baseBranch }]
            }
            value={baseBranch}
            onValueChange={onBaseBranchChange}
          />
        </AdvancedSection>
      )}

      <Actions>
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={!!branchError || !branchName.trim() || submitting}
          loading={submitting}
        >
          Create Job
        </Button>
      </Actions>
    </Wrapper>
  );
};

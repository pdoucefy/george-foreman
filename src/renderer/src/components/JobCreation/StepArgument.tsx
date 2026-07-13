import type { Workflow } from '@shared/types';

import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { Button } from '../ui/Button.tsx';
import { Textarea } from '../ui/Textarea.tsx';

// ─── Styled ───────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const BranchPreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
`;

const BranchPreviewLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.text.secondary};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
`;

const BranchPreviewValue = styled.code`
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.accent.primary};
  word-break: break-all;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;

// ─── Component ────────────────────────────────────────────────────────────────

type StepArgumentProps = {
  workflow: Workflow;
  argument: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
};

export const StepArgument = ({
  workflow,
  argument,
  onChange,
  onNext,
  onBack,
}: StepArgumentProps): React.JSX.Element => {
  const [branchPreview, setBranchPreview] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced branch preview update
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      window.api.branch
        .preview({ argument, workflowName: workflow.name, githubHandle: '' })
        .then((preview) => setBranchPreview(preview))
        .catch(console.error);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [argument, workflow.name]);

  const isRequired = workflow.argument === 'required';
  const isNextDisabled = isRequired && argument.trim() === '';

  return (
    <Wrapper>
      <Textarea
        id="job-argument"
        label="Argument"
        value={argument}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. AV-123, the auth module, ..."
        rows={3}
      />

      {branchPreview && (
        <BranchPreview>
          <BranchPreviewLabel>Branch preview</BranchPreviewLabel>
          <BranchPreviewValue>{branchPreview}</BranchPreviewValue>
        </BranchPreview>
      )}

      <Actions>
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" onClick={onNext} disabled={isNextDisabled}>
          Next →
        </Button>
      </Actions>
    </Wrapper>
  );
};

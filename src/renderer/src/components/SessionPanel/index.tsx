import type { Job } from '@shared/types';

import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Header = styled.div`
  padding: ${({ theme }) => theme.space[4]};
  border-bottom: 1px solid ${({ theme }) => theme.border.subtle};
`;

const WorkflowName = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.text.primary};
`;

const Meta = styled.span`
  color: ${({ theme }) => theme.text.secondary};
  font-family: ${({ theme }) => theme.font.condensed};
  font-size: ${({ theme }) => theme.fontSize.sm};
  margin-left: ${({ theme }) => theme.space[2]};
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.text.disabled};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

type SessionPanelProps = {
  job: Job | null;
};

export const SessionPanel = ({ job }: SessionPanelProps): React.JSX.Element => {
  if (!job) {
    return (
      <Wrapper>
        <EmptyState>Select a job to view details</EmptyState>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Header>
        <WorkflowName>{job.workflowName}</WorkflowName>
        <Meta>· {job.repoName}</Meta>
        <Meta>· {job.branchName}</Meta>
      </Header>
      {/* Session panel content implemented in M18 */}
      <EmptyState>Session panel coming in M18</EmptyState>
    </Wrapper>
  );
};

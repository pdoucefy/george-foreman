import React, { useState } from 'react';
import styled from 'styled-components';

import { Button } from '../ui/Button.tsx';
import { TextInput } from '../ui/TextInput.tsx';

// §8 — First-launch onboarding overlay (2 steps)

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.bg.app};
  z-index: 100;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.bg.panel};
  border: 1px solid ${({ theme }) => theme.border.default};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: ${({ theme }) => theme.space[8]};
  width: 440px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
`;

const AppTitle = styled.h1`
  font-family: ${({ theme }) => theme.font.display};
  font-size: 32px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 0.01em;
  color: ${({ theme }) => theme.accent.primary};
  text-shadow: ${({ theme }) => theme.shadow.glow};
  margin: 0;
`;

const AppSubtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.secondary};
  margin: 0;
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding-bottom: ${({ theme }) => theme.space[4]};
  border-bottom: 1px solid ${({ theme }) => theme.border.subtle};
`;

const StepIndicator = styled.p`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.text.secondary};
  margin: 0;
  font-family: ${({ theme }) => theme.font.condensed};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const StepHeading = styled.h2`
  font-size: ${({ theme }) => theme.fontSize['2xl']};
  font-weight: 600;
  color: ${({ theme }) => theme.text.primary};
  margin: 0;
`;

const StepSubtext = styled.p`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.secondary};
  margin: 0;
`;

const BrowseRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  align-items: flex-end;
`;

const BrowseInputWrapper = styled.div`
  flex: 1;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const GITHUB_HANDLE_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

const validateFolder = (value: string): string | null =>
  value.trim() ? null : 'Please select a valid folder';

const validateGithubHandle = (value: string): string | null =>
  GITHUB_HANDLE_RE.test(value.trim()) ? null : 'Please enter a valid GitHub username';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type OnboardingProps = {
  onDone: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Onboarding = ({ onDone }: OnboardingProps): React.JSX.Element => {
  const [step, setStep] = useState<1 | 2>(1);
  const [folder, setFolder] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [handleError, setHandleError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleBrowse = async (): Promise<void> => {
    const selected = await window.api.dialog.openDirectory();
    if (selected) setFolder(selected);
  };

  const handleNext = (): void => {
    const error = validateFolder(folder);
    if (error) {
      setFolderError(error);
      return;
    }
    setFolderError(null);
    setStep(2);
  };

  const handleGetStarted = async (): Promise<void> => {
    const error = validateGithubHandle(handle);
    if (error) {
      setHandleError(error);
      return;
    }
    setHandleError(null);
    setSubmitting(true);
    try {
      await window.api.onboarding.complete({
        workspaceFolder: folder.trim(),
        githubHandle: handle.trim(),
      });
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay>
      <Card>
        <Header>
          <AppTitle>🔥 George Foreman</AppTitle>
          <AppSubtitle>AI Agent Workflow Manager</AppSubtitle>
        </Header>

        {step === 1 ? (
          <>
            <div>
              <StepIndicator>Step 1 of 2</StepIndicator>
              <StepHeading>Where are your Git repositories?</StepHeading>
              <StepSubtext>George Foreman will scan this folder for repos.</StepSubtext>
            </div>

            <BrowseRow>
              <BrowseInputWrapper>
                <TextInput
                  id="workspace-folder"
                  label="Workspace folder"
                  value={folder}
                  onChange={(e) => {
                    setFolder(e.target.value);
                    if (folderError) setFolderError(null);
                  }}
                  placeholder="/Users/you/workspace"
                  error={folderError ?? undefined}
                />
              </BrowseInputWrapper>
              <Button variant="secondary" onClick={handleBrowse}>
                Browse…
              </Button>
            </BrowseRow>

            <Actions>
              <Button variant="primary" onClick={handleNext} disabled={!folder.trim()}>
                Next →
              </Button>
            </Actions>
          </>
        ) : (
          <>
            <div>
              <StepIndicator>Step 2 of 2</StepIndicator>
              <StepHeading>What&apos;s your GitHub username?</StepHeading>
              <StepSubtext>
                Used for naming branches when no other pattern matches (e.g.{' '}
                <code>pdoucefy/feature-name</code>)
              </StepSubtext>
            </div>

            <TextInput
              id="github-handle"
              label="GitHub username"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                if (handleError) setHandleError(null);
              }}
              placeholder="pdoucefy"
              error={handleError ?? undefined}
            />

            <Actions>
              <Button
                variant="primary"
                onClick={handleGetStarted}
                disabled={!handle.trim() || submitting}
                loading={submitting}
              >
                Get Started →
              </Button>
            </Actions>
          </>
        )}
      </Card>
    </Overlay>
  );
};

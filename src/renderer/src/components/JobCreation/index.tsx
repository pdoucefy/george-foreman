import type { Job, Repo, Workflow } from '@shared/types';

import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

import { Modal } from '../ui/Modal/index.tsx';
import { Spinner } from '../ui/Spinner.tsx';
import { StepArgument } from './StepArgument.tsx';
import { StepConfirm } from './StepConfirm.tsx';
import { StepRepo } from './StepRepo.tsx';
import { StepWorkflow } from './StepWorkflow.tsx';

// ─── Styled ───────────────────────────────────────────────────────────────────

const StepHeader = styled.div`
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

const StepIndicator = styled.p`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.text.secondary};
  margin: 0 0 ${({ theme }) => theme.space[1]};
  font-family: ${({ theme }) => theme.font.condensed};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const StepHeading = styled.h3`
  font-size: ${({ theme }) => theme.fontSize.xl};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.text.primary};
  margin: 0;
`;

const LoadingWrapper = styled.div`
  display: flex;
  justify-content: center;
  padding: ${({ theme }) => theme.space[8]};
`;

const ErrorMessage = styled.p`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.status.failed};
  margin: 0;
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Sort repos alphabetically by name
const sortRepos = (repos: Repo[]): Repo[] =>
  [...repos].sort((a, b) => a.name.localeCompare(b.name));

// Derive the default repo from active jobs (most-recently-created)
const defaultRepo = (repos: Repo[], activeJobs: Job[]): Repo | null => {
  if (repos.length === 0) return null;
  if (activeJobs.length > 0) {
    const sorted = [...activeJobs].sort((a, b) => b.createdAt - a.createdAt);
    const lastPath = sorted[0].repoPath;
    const match = repos.find((r) => r.path === lastPath);
    if (match) return match;
  }
  return sortRepos(repos)[0] ?? null;
};

// Derive the default workflow (most-recently-used, then first in list)
const defaultWorkflow = (workflows: Workflow[], activeJobs: Job[]): Workflow | null => {
  if (workflows.length === 0) return null;
  if (activeJobs.length > 0) {
    const sorted = [...activeJobs].sort((a, b) => b.createdAt - a.createdAt);
    const lastName = sorted[0].workflowName;
    const match = workflows.find((w) => w.name === lastName);
    if (match) return match;
  }
  return workflows[0] ?? null;
};

// ─── Component ────────────────────────────────────────────────────────────────

type JobCreationProps = {
  onClose: () => void;
};

export const JobCreation = ({ onClose }: JobCreationProps): React.JSX.Element => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);

  const [step, setStep] = useState<Step>(1);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [argument, setArgument] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);
  const [baseBranch, setBaseBranch] = useState('');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load repos + active jobs on mount
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [scannedRepos, jobs] = await Promise.all([
          window.api.workspace.scan(),
          window.api.job.listActive(),
        ]);
        const sorted = sortRepos(scannedRepos);
        setRepos(sorted);
        setActiveJobs(jobs);
        setSelectedRepo(defaultRepo(sorted, jobs));
      } catch (err) {
        setLoadError((err as Error).message ?? 'Failed to load repos');
      } finally {
        setLoading(false);
      }
    };
    load().catch(console.error);
  }, []);

  // Load workflows when repo is selected
  useEffect(() => {
    if (!selectedRepo) return;
    window.api.workflow
      .list(selectedRepo.path)
      .then((wfs) => {
        setWorkflows(wfs);
        setSelectedWorkflow(defaultWorkflow(wfs, activeJobs));
      })
      .catch(console.error);
  }, [selectedRepo, activeJobs]);

  // ── Step helpers ────────────────────────────────────────────────────────────

  const totalSteps = (): number => {
    if (!selectedWorkflow) return 4;
    const arg = selectedWorkflow.argument ?? 'none';
    return arg === 'none' ? 3 : 4;
  };

  const stepLabel = (): string => {
    const total = totalSteps();
    if (step === 1) return `Step 1 of ${total}`;
    if (step === 2) return `Step 2 of ${total}`;
    if (step === 3 && selectedWorkflow && (selectedWorkflow.argument ?? 'none') !== 'none')
      return `Step 3 of ${total}`;
    return `Step ${total} of ${total}`;
  };

  const stepTitle = (): string => {
    if (step === 1) return 'Select a repo';
    if (step === 2) return 'Select a workflow';
    if (step === 3 && selectedWorkflow && (selectedWorkflow.argument ?? 'none') !== 'none')
      return 'Enter an argument';
    return 'Confirm';
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleRepoNext = (): void => {
    setStep(2);
  };

  const enterConfirmStep = (workflow: Workflow, arg: string): void => {
    // Preview branch name and load available branches
    window.api.branch
      .preview({ argument: arg, workflowName: workflow.name, githubHandle: '' })
      .then((preview) => {
        setBranchName(preview);
        setBranchError(null);
      })
      .catch(console.error);

    if (selectedRepo) {
      window.api.repo
        .listBranches(selectedRepo.path)
        .then((branches) => {
          setAvailableBranches(branches);
          const def = selectedRepo.defaultBranch;
          setBaseBranch(branches.includes(def) ? def : (branches[0] ?? def));
        })
        .catch(console.error);
    }

    setStep(4);
  };

  const handleWorkflowNext = (): void => {
    if (!selectedWorkflow) return;
    const hasArg = (selectedWorkflow.argument ?? 'none') !== 'none';
    if (hasArg) {
      setStep(3);
    } else {
      enterConfirmStep(selectedWorkflow, '');
    }
  };

  const handleArgumentNext = (): void => {
    if (!selectedWorkflow) return;
    enterConfirmStep(selectedWorkflow, argument);
  };

  const handleBranchBlur = (): void => {
    if (!selectedRepo) return;
    const activeJobIds = activeJobs.map((j) => j.id);
    window.api.branch
      .validate({ repoPath: selectedRepo.path, branchName, activeJobIds })
      .then((result) => {
        setBranchError(result.valid ? null : (result.error ?? 'Invalid branch name'));
      })
      .catch(console.error);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (): Promise<void> => {
    if (!selectedRepo || !selectedWorkflow) return;
    setSubmitError(null);

    // Validate repo still exists
    const currentRepos = await window.api.workspace.scan().catch(() => null);
    if (currentRepos && !currentRepos.find((r) => r.path === selectedRepo.path)) {
      setSubmitError('Repo not found. It may have been removed from your workspace.');
      return;
    }

    // Validate workflow still exists
    const currentWorkflows = await window.api.workflow.list(selectedRepo.path).catch(() => null);
    if (
      currentWorkflows &&
      !currentWorkflows.find(
        (w) => w.name === selectedWorkflow.name && w.source === selectedWorkflow.source,
      )
    ) {
      setSubmitError('Workflow no longer available.');
      return;
    }

    // Validate branch
    const activeJobIds = activeJobs.map((j) => j.id);
    const validation = await window.api.branch
      .validate({ repoPath: selectedRepo.path, branchName, activeJobIds })
      .catch(() => ({ valid: false, error: 'Validation failed' }));
    if (!validation.valid) {
      setBranchError(validation.error ?? 'Invalid branch name');
      return;
    }

    setSubmitting(true);
    try {
      await window.api.job.create({
        repoPath: selectedRepo.path,
        workflowName: selectedWorkflow.name,
        workflowTasks: selectedWorkflow.tasks,
        argument,
        branchName,
        baseBranch,
      });
      onClose();
    } catch (err) {
      setSubmitError((err as Error).message ?? 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step back ───────────────────────────────────────────────────────────────

  const handleConfirmBack = (): void => {
    if (!selectedWorkflow) {
      setStep(2);
      return;
    }
    const hasArg = (selectedWorkflow.argument ?? 'none') !== 'none';
    setStep(hasArg ? 3 : 2);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderContent = (): React.ReactNode => {
    if (loading) {
      return (
        <LoadingWrapper>
          <Spinner aria-label="Loading" />
        </LoadingWrapper>
      );
    }

    if (loadError) {
      return <ErrorMessage>{loadError}</ErrorMessage>;
    }

    if (step === 1) {
      return (
        <StepRepo
          repos={repos}
          selectedRepo={selectedRepo}
          onSelect={setSelectedRepo}
          onNext={handleRepoNext}
        />
      );
    }

    if (step === 2) {
      return (
        <StepWorkflow
          workflows={workflows}
          selectedWorkflow={selectedWorkflow}
          onSelect={setSelectedWorkflow}
          onNext={handleWorkflowNext}
          onBack={() => setStep(1)}
        />
      );
    }

    if (step === 3 && selectedWorkflow && (selectedWorkflow.argument ?? 'none') !== 'none') {
      return (
        <StepArgument
          workflow={selectedWorkflow}
          argument={argument}
          onChange={setArgument}
          onNext={handleArgumentNext}
          onBack={() => setStep(2)}
        />
      );
    }

    if (step === 4 && selectedRepo && selectedWorkflow) {
      return (
        <>
          {submitError && <ErrorMessage>{submitError}</ErrorMessage>}
          <StepConfirm
            repo={selectedRepo}
            workflow={selectedWorkflow}
            argument={argument}
            branchName={branchName}
            branchError={branchError}
            onBranchNameChange={(v) => {
              setBranchName(v);
              setBranchError(null);
            }}
            onBranchBlur={handleBranchBlur}
            baseBranch={baseBranch}
            onBaseBranchChange={setBaseBranch}
            availableBranches={availableBranches}
            onSubmit={handleSubmit}
            onBack={handleConfirmBack}
            submitting={submitting}
          />
        </>
      );
    }

    return null;
  };

  return (
    <Modal open onClose={onClose} title="New Job">
      <StepHeader>
        <StepIndicator>{stepLabel()}</StepIndicator>
        <StepHeading>{stepTitle()}</StepHeading>
      </StepHeader>
      {renderContent()}
    </Modal>
  );
};

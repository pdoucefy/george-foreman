import React, { useEffect, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';

import { GlobalStyle } from './GlobalStyle.ts';
import { DashboardTab } from './components/DashboardTab/index.tsx';
import { JobCreation } from './components/JobCreation/index.tsx';
import { Layout } from './components/Layout/index.tsx';
import { Onboarding } from './components/Onboarding/index.tsx';
import { SessionPanel } from './components/SessionPanel/index.tsx';
import { Settings } from './components/Settings/index.tsx';
import { Banner } from './components/ui/Banner.tsx';
import { Spinner } from './components/ui/Spinner.tsx';
import { useAppStore } from './store.ts';
import { theme as appTheme } from './theme.ts';

// ─── Layout shells ────────────────────────────────────────────────────────────

const AppShell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
`;

// ─── Nav bar ──────────────────────────────────────────────────────────────────

const NavBar = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: 0 ${({ theme }) => theme.space[4]};
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid ${({ theme }) => theme.border.subtle};
  background: ${({ theme }) => theme.bg.panel};
`;

const AppTitle = styled.span`
  font-family: ${({ theme }) => theme.font.display};
  font-size: ${({ theme }) => theme.fontSize.lg};
  color: ${({ theme }) => theme.accent.primary};
  margin-right: ${({ theme }) => theme.space[3]};
`;

type TabButtonProps = { $active: boolean };

const TabButton = styled.button<TabButtonProps>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  background: none;
  border: none;
  border-bottom: 2px solid
    ${({ theme, $active }) => ($active ? theme.accent.primary : 'transparent')};
  color: ${({ theme, $active }) => ($active ? theme.text.primary : theme.text.secondary)};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.fontSize.md};
  font-weight: ${({ theme, $active }) =>
    $active ? theme.fontWeight.semibold : theme.fontWeight.normal};
  padding: 0 ${({ theme }) => theme.space[2]};
  height: 44px;
  cursor: pointer;
  transition: color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.text.primary};
  }
`;

const NavBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: ${({ theme }) => theme.radius.full};
  background: ${({ theme }) => theme.status.attention};
  color: ${({ theme }) => theme.text.inverse};
  font-family: ${({ theme }) => theme.font.condensed};
  font-size: ${({ theme }) => theme.fontSize.xs};
  font-weight: ${({ theme }) => theme.fontWeight.bold};
`;

const NavSpacer = styled.div`
  flex: 1;
`;

const GearButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: ${({ theme }) => theme.text.secondary};
  font-size: ${({ theme }) => theme.fontSize['2xl']};
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;

  &:hover {
    color: ${({ theme }) => theme.text.primary};
    background: ${({ theme }) => theme.bg.elevated};
  }
`;

// ─── App status ───────────────────────────────────────────────────────────────

type AppStatus = 'loading' | 'onboarding' | 'ready';

// ─── App ──────────────────────────────────────────────────────────────────────

export const App = (): React.JSX.Element => {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [showJobCreation, setShowJobCreation] = useState(false);

  const binaryFound = useAppStore((s) => s.binaryFound);
  const setBinaryFound = useAppStore((s) => s.setBinaryFound);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const showSettings = useAppStore((s) => s.showSettings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const jobs = useAppStore((s) => s.jobs);
  const selectedJobId = useAppStore((s) => s.selectedJobId);

  // Count needs_attention jobs for Dock badge and nav badge
  const needsAttentionCount = Object.values(jobs).filter(
    (j) => j.status === 'needs_attention' && j.archivedAt === null,
  ).length;

  // Hydrate store from IPC
  useEffect(() => {
    if (status !== 'ready') return;
    Promise.all([window.api.job.listActive(), window.api.job.listArchive()])
      .then(([active, archived]) => {
        const store = useAppStore.getState();
        for (const job of [...active, ...archived]) {
          store.upsertJob(job);
        }
      })
      .catch(console.error);
  }, [status]);

  // Check onboarding status
  useEffect(() => {
    window.api.onboarding
      .isComplete()
      .then((complete) => {
        setStatus(complete ? 'ready' : 'onboarding');
      })
      .catch(console.error);
  }, []);

  // Wire push subscriptions
  useEffect(() => {
    const unsubBinary = window.api.onBinaryStatus(({ found }) => {
      setBinaryFound(found);
    });
    const unsubSettings = window.api.onNavigateSettings(() => {
      setShowSettings(true);
    });
    const unsubJobCreated = window.api.onJobCreated((job) => {
      useAppStore.getState().upsertJob(job);
    });
    const unsubJobUpdated = window.api.onJobUpdated((job) => {
      useAppStore.getState().upsertJob(job);
    });
    const unsubWorkspace = window.api.onWorkspaceUpdated((repos) => {
      useAppStore.getState().setRepos(repos);
    });
    const unsubNavigateJob = window.api.onNavigateJob((jobId) => {
      useAppStore.getState().setShowSettings(false);
      useAppStore.getState().setActiveTab('dashboard');
      useAppStore.getState().selectJob(jobId);
    });
    const unsubSseEvent = window.api.onSseEvent(({ jobId, event }) => {
      useAppStore.getState().appendSseEvent(jobId, event);
    });
    const unsubSseOrchestratorEvent = window.api.onSseOrchestratorEvent(({ jobId, event }) => {
      useAppStore.getState().appendOrchestratorEvent(jobId, event);
    });

    return () => {
      unsubBinary();
      unsubSettings();
      unsubJobCreated();
      unsubJobUpdated();
      unsubWorkspace();
      unsubNavigateJob();
      unsubSseEvent();
      unsubSseOrchestratorEvent();
    };
  }, [setBinaryFound, setShowSettings]);

  // Cmd+, → open Settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShowSettings]);

  const handleOnboardingDone = (): void => {
    setStatus('ready');
  };

  const selectedJob = selectedJobId !== null ? (jobs[selectedJobId] ?? null) : null;

  return (
    <ThemeProvider theme={appTheme}>
      <GlobalStyle />
      {status === 'loading' && <Spinner aria-label="Loading" />}
      {status === 'onboarding' && <Onboarding onDone={handleOnboardingDone} />}
      {status === 'ready' && (
        <AppShell>
          <Banner binaryFound={binaryFound} />
          <NavBar>
            <AppTitle>George Foreman</AppTitle>
            <TabButton
              $active={activeTab === 'dashboard' && !showSettings}
              onClick={() => {
                setShowSettings(false);
                setActiveTab('dashboard');
              }}
            >
              Dashboard
              {needsAttentionCount > 0 && <NavBadge>{needsAttentionCount}</NavBadge>}
            </TabButton>
            <TabButton
              $active={activeTab === 'archive' && !showSettings}
              onClick={() => {
                setShowSettings(false);
                setActiveTab('archive');
              }}
            >
              Archive
            </TabButton>
            <NavSpacer />
            <GearButton
              aria-label="Settings"
              onClick={() => setShowSettings(true)}
              title="Settings (⌘,)"
            >
              ⚙
            </GearButton>
          </NavBar>

          {showSettings && <Settings onBack={() => setShowSettings(false)} />}
          {!showSettings && activeTab === 'dashboard' && (
            <>
              <Layout
                left={<DashboardTab onNewJob={() => setShowJobCreation(true)} />}
                right={<SessionPanel job={selectedJob} />}
              />
              {showJobCreation && <JobCreation onClose={() => setShowJobCreation(false)} />}
            </>
          )}
          {!showSettings && activeTab === 'archive' && (
            /* ArchiveTab implemented in M21 */
            <Layout
              left={<div style={{ padding: 16, color: '#9a9390' }}>Archive coming in M21</div>}
              right={<SessionPanel job={selectedJob} />}
            />
          )}
        </AppShell>
      )}
    </ThemeProvider>
  );
};

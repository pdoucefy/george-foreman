import React, { useEffect, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';

import { GlobalStyle } from './GlobalStyle.ts';
import { JobCreation } from './components/JobCreation/index.tsx';
import { Onboarding } from './components/Onboarding/index.tsx';
import { Banner } from './components/ui/Banner.tsx';
import { Button } from './components/ui/Button.tsx';
import { Spinner } from './components/ui/Spinner.tsx';
import { useAppStore } from './store.ts';
import { theme as appTheme } from './theme.ts';

// Temporary shell until DashboardTab is built in M17
const AppShell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

const ShellToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  border-bottom: 1px solid ${({ theme }) => theme.border.subtle};
`;

// App shell: routes between Onboarding (first launch) and main UI.

type AppStatus = 'loading' | 'onboarding' | 'ready';

export const App = (): React.JSX.Element => {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [showJobCreation, setShowJobCreation] = useState(false);
  const binaryFound = useAppStore((s) => s.binaryFound);
  const setBinaryFound = useAppStore((s) => s.setBinaryFound);
  const setShowSettings = useAppStore((s) => s.setShowSettings);

  useEffect(() => {
    window.api.onboarding
      .isComplete()
      .then((complete) => {
        setStatus(complete ? 'ready' : 'onboarding');
      })
      .catch(console.error);
  }, []);

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

    return () => {
      unsubBinary();
      unsubSettings();
      unsubJobCreated();
      unsubJobUpdated();
      unsubWorkspace();
      unsubNavigateJob();
    };
  }, [setBinaryFound, setShowSettings]);

  const handleOnboardingDone = (): void => {
    setStatus('ready');
  };

  return (
    <ThemeProvider theme={appTheme}>
      <GlobalStyle />
      {status === 'loading' && <Spinner aria-label="Loading" />}
      {status === 'onboarding' && <Onboarding onDone={handleOnboardingDone} />}
      {status === 'ready' && (
        <AppShell>
          <Banner binaryFound={binaryFound} />
          <ShellToolbar>
            {/* Temporary entry point — replaced by DashboardTab toolbar in M17 */}
            <Button variant="primary" onClick={() => setShowJobCreation(true)}>
              New Job
            </Button>
          </ShellToolbar>
          {showJobCreation && <JobCreation onClose={() => setShowJobCreation(false)} />}
        </AppShell>
      )}
    </ThemeProvider>
  );
};

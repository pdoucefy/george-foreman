import React, { useEffect, useState } from 'react';
import { ThemeProvider } from 'styled-components';

import { GlobalStyle } from './GlobalStyle.ts';
import { Onboarding } from './components/Onboarding/index.tsx';
import { Banner } from './components/ui/Banner.tsx';
import { Spinner } from './components/ui/Spinner.tsx';
import { useAppStore } from './store.ts';
import { theme } from './theme.ts';

// App shell: routes between Onboarding (first launch) and main UI.

type AppStatus = 'loading' | 'onboarding' | 'ready';

export const App = (): React.JSX.Element => {
  const [status, setStatus] = useState<AppStatus>('loading');
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
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      {status === 'loading' && <Spinner aria-label="Loading" />}
      {status === 'onboarding' && <Onboarding onDone={handleOnboardingDone} />}
      {status === 'ready' && (
        <>
          <Banner binaryFound={binaryFound} />
          {/* Main shell — DashboardTab / ArchiveTab / Settings wired in M17+ */}
        </>
      )}
    </ThemeProvider>
  );
};

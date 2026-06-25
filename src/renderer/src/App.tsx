import React from 'react';
import styled, { ThemeProvider } from 'styled-components';

import { GlobalStyle } from './GlobalStyle.ts';
import { theme } from './theme.ts';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 8px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #888;
`;

const App = (): React.JSX.Element => (
  <ThemeProvider theme={theme}>
    <GlobalStyle />
    <Container>
      <Title>George Foreman</Title>
      <Subtitle>AI Agent Workflow Manager</Subtitle>
    </Container>
  </ThemeProvider>
);

export { App };

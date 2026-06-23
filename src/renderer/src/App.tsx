import React from 'react';
import styled, { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a1a;
    color: #e0e0e0;
  }
`;

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
  <>
    <GlobalStyle />
    <Container>
      <Title>George Foreman</Title>
      <Subtitle>AI Agent Workflow Manager</Subtitle>
    </Container>
  </>
);

export { App };

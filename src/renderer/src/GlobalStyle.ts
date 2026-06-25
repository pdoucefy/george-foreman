import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => `${theme.border.default} ${theme.bg.elevated}`};
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  ::-webkit-scrollbar-track {
    background: ${({ theme }) => theme.bg.elevated};
  }

  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.border.default};
    border-radius: ${({ theme }) => theme.radius.full};
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.border.strong};
  }

  body {
    background: ${({ theme }) => theme.bg.app};
    color: ${({ theme }) => theme.text.primary};
    font-family: ${({ theme }) => theme.font.sans};
    font-size: ${({ theme }) => theme.fontSize.md};
    font-weight: ${({ theme }) => theme.fontWeight.normal};
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::selection {
    background: ${({ theme }) => `${theme.accent.primary}66`};
  }
`;

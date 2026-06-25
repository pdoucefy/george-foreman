import React from 'react';
import styled from 'styled-components';

// ─── CodeBlock (fenced) ───────────────────────────────────────────────────────
// Syntax highlighting is intentionally deferred to M18 when the chat thread
// is wired up. For now this is a styled wrapper only.

const Pre = styled.pre`
  background-color: ${({ theme }) => theme.bg.elevated};
  border: 1px solid ${({ theme }) => theme.border.subtle};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => theme.space[4]};
  overflow: auto;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.fontSize.sm};
  line-height: 1.6;
  color: ${({ theme }) => theme.text.primary};
  margin: 0;
`;

const PreCode = styled.code`
  font-family: inherit;
  font-size: inherit;
  background: none;
  padding: 0;
`;

type CodeBlockProps = {
  language?: string;
  children: React.ReactNode;
  className?: string;
};

export const CodeBlock = ({
  language,
  children,
  className,
}: CodeBlockProps): React.ReactElement => (
  <Pre className={className}>
    <PreCode data-language={language}>{children}</PreCode>
  </Pre>
);

// ─── Code (inline) ────────────────────────────────────────────────────────────

export const Code = styled.code`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 0.9em;
  background-color: ${({ theme }) => theme.bg.elevated};
  color: ${({ theme }) => theme.accent.warm};
  padding: 1px ${({ theme }) => theme.space[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.border.subtle};
`;

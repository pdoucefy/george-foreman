import React from 'react';
import styled from 'styled-components';

const ScrollRoot = styled.div`
  overflow: auto;
  height: 100%;

  /* Scoped scrollbar styles to ensure they apply even inside portals */
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.border.default} transparent;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: ${({ theme }) => theme.border.default};
    border-radius: ${({ theme }) => theme.radius.full};
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: ${({ theme }) => theme.border.strong};
  }
`;

type ScrollAreaProps = {
  children: React.ReactNode;
  className?: string;
};

export const ScrollArea = ({ children, className }: ScrollAreaProps): React.ReactElement => (
  <ScrollRoot className={className}>{children}</ScrollRoot>
);

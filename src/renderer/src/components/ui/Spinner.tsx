import React from 'react';
import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

type SpinnerRootProps = {
  $size: number;
};

const SpinnerRoot = styled.span<SpinnerRootProps>`
  display: inline-block;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: ${({ theme }) => theme.radius.full};
  border: 2px solid ${({ theme }) => theme.border.default};
  border-top-color: ${({ theme }) => theme.accent.primary};
  animation: ${spin} 0.7s linear infinite;
  flex-shrink: 0;
`;

type SpinnerProps = {
  size?: number;
  'aria-label'?: string;
  className?: string;
};

export const Spinner = ({
  size = 16,
  'aria-label': ariaLabel = 'Loading',
  className,
}: SpinnerProps): React.ReactElement => (
  <SpinnerRoot role="status" aria-label={ariaLabel} $size={size} className={className} />
);

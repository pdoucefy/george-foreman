import React from 'react';
import styled, { css } from 'styled-components';

import { Spinner } from './Spinner.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonRootProps = {
  $variant: ButtonVariant;
};

const variantStyles = {
  primary: css`
    background-color: ${({ theme }) => theme.accent.primary};
    color: ${({ theme }) => theme.text.inverse};
    border-color: transparent;
    &:hover:not(:disabled) {
      background-color: ${({ theme }) => theme.accent.warm};
    }
  `,
  secondary: css`
    background-color: ${({ theme }) => theme.bg.elevated};
    color: ${({ theme }) => theme.text.primary};
    border-color: ${({ theme }) => theme.border.default};
    &:hover:not(:disabled) {
      background-color: ${({ theme }) => theme.bg.card};
      border-color: ${({ theme }) => theme.border.strong};
    }
  `,
  ghost: css`
    background-color: transparent;
    color: ${({ theme }) => theme.text.secondary};
    border-color: transparent;
    &:hover:not(:disabled) {
      background-color: ${({ theme }) => theme.bg.elevated};
      color: ${({ theme }) => theme.text.primary};
    }
  `,
  danger: css`
    background-color: transparent;
    color: ${({ theme }) => theme.status.failed};
    border-color: ${({ theme }) => theme.status.failed}55;
    &:hover:not(:disabled) {
      background-color: ${({ theme }) => theme.status.failed}22;
    }
  `,
};

const ButtonRoot = styled.button<ButtonRootProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[4]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    color 0.15s;
  white-space: nowrap;
  ${({ $variant }) => variantStyles[$variant]}
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.accent.primary};
    outline-offset: 2px;
  }
`;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  children: React.ReactNode;
};

export const Button = ({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps): React.ReactElement => (
  <ButtonRoot $variant={variant} disabled={disabled || loading} {...props}>
    {loading && <Spinner size={14} aria-label="Loading" />}
    {children}
  </ButtonRoot>
);

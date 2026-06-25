import styled, { css } from 'styled-components';

// ─── Shared field layout primitives ──────────────────────────────────────────

export const FieldWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
`;

export const FieldLabel = styled.label`
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: ${({ theme }) => theme.fontWeight.medium};
  color: ${({ theme }) => theme.text.secondary};
`;

export const FieldError = styled.span`
  font-size: ${({ theme }) => theme.fontSize.xs};
  color: ${({ theme }) => theme.status.failed};
`;

// ─── Shared input/textarea CSS ────────────────────────────────────────────────

export const fieldInputCss = css<{ $hasError: boolean }>`
  background-color: ${({ theme }) => theme.bg.input};
  color: ${({ theme }) => theme.text.primary};
  border: 1px solid
    ${({ theme, $hasError }) => ($hasError ? theme.status.failed : theme.border.default)};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.fontSize.md};
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[3]};
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
  &::placeholder {
    color: ${({ theme }) => theme.text.disabled};
  }
  &:hover:not(:disabled) {
    border-color: ${({ theme, $hasError }) =>
      $hasError ? theme.status.failed : theme.border.strong};
  }
  &:focus {
    border-color: ${({ theme, $hasError }) =>
      $hasError ? theme.status.failed : theme.accent.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.accent.glow};
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

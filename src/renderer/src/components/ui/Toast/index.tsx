import type { Theme } from '@renderer/theme';

import { X } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { icon } from '../Icon.tsx';
import { ToastContext } from './useToast.ts';
import type { ToastOptions, ToastVariant } from './useToast.ts';

const XIcon = icon(X);

const DEFAULT_DURATION = 4000;

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getVariantColor = (theme: Theme, variant: ToastVariant): string => {
  switch (variant) {
    case 'success':
      return theme.status.completed;
    case 'error':
      return theme.status.failed;
    default:
      return theme.text.secondary;
  }
};

// ─── Styled primitives ────────────────────────────────────────────────────────

const Container = styled.div`
  position: fixed;
  top: ${({ theme }) => theme.space[4]};
  right: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  z-index: 300;
  pointer-events: none;
`;

type ToastItemRootProps = {
  $variant: ToastVariant;
};

const ToastItemRoot = styled.div<ToastItemRootProps>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  background-color: ${({ theme }) => theme.bg.elevated};
  border: 1px solid ${({ theme }) => theme.border.default};
  border-left: 3px solid ${({ theme, $variant }) => getVariantColor(theme, $variant)};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.md};
  min-width: 280px;
  max-width: 420px;
  pointer-events: all;
`;

const Message = styled.span`
  flex: 1;
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.text.primary};
  line-height: 1.4;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: ${({ theme }) => theme.text.disabled};
  border-radius: ${({ theme }) => theme.radius.sm};
  flex-shrink: 0;
  &:hover {
    color: ${({ theme }) => theme.text.secondary};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.accent.primary};
    outline-offset: 2px;
  }
`;

// ─── ToastProvider ────────────────────────────────────────────────────────────

type ToastProviderProps = {
  children: React.ReactNode;
};

export const ToastProvider = ({ children }: ToastProviderProps): React.ReactElement => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ message, variant = 'info', duration = DEFAULT_DURATION }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Container aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItemRoot key={t.id} $variant={t.variant}>
            <Message>{t.message}</Message>
            <CloseButton aria-label="Close" onClick={() => dismiss(t.id)}>
              <XIcon size={12} />
            </CloseButton>
          </ToastItemRoot>
        ))}
      </Container>
    </ToastContext.Provider>
  );
};

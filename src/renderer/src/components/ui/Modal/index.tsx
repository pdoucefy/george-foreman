import FocusTrap from 'focus-trap-react';
import React, { useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';

// ─── Styled primitives ────────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const Panel = styled.div`
  background-color: ${({ theme }) => theme.bg.panel};
  border: 1px solid ${({ theme }) => theme.border.default};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  min-width: 360px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[6]};
  border-bottom: 1px solid ${({ theme }) => theme.border.subtle};
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.text.primary};
  margin: 0;
`;

const Body = styled.div`
  padding: ${({ theme }) => theme.space[6]};
  flex: 1;
`;

// ─── Component ────────────────────────────────────────────────────────────────

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export const Modal = ({
  open,
  onClose,
  title,
  children,
}: ModalProps): React.ReactElement | null => {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return ReactDOM.createPortal(
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        fallbackFocus: () => document.body,
      }}
    >
      <Backdrop data-testid="modal-backdrop" onClick={handleBackdropClick}>
        <Panel role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined}>
          {title && (
            <Header>
              <Title id="modal-title">{title}</Title>
            </Header>
          )}
          <Body>{children}</Body>
        </Panel>
      </Backdrop>
    </FocusTrap>,
    document.body,
  );
};

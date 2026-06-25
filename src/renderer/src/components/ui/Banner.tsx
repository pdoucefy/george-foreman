import React from 'react';
import styled from 'styled-components';

import { Button } from './Button.tsx';

// §8 — Binary missing banner

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const BannerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  background: color-mix(
    in srgb,
    ${({ theme }) => theme.status.attention} 12%,
    ${({ theme }) => theme.bg.panel}
  );
  border-left: 3px solid ${({ theme }) => theme.status.attention};
  color: ${({ theme }) => theme.text.primary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const BannerIcon = styled.span`
  color: ${({ theme }) => theme.status.attention};
  flex-shrink: 0;
`;

const BannerMessage = styled.span`
  flex: 1;
`;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type BannerProps = {
  binaryFound: boolean | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Banner = ({ binaryFound }: BannerProps): React.JSX.Element | null => {
  if (binaryFound !== false) return null;

  const handleRecheck = (): void => {
    window.api.binary.recheck().catch(console.error);
  };

  return (
    <BannerContainer>
      <BannerIcon>⚠</BannerIcon>
      <BannerMessage>
        opencode not found on PATH — install it at opencode.ai, then click Recheck.
      </BannerMessage>
      <Button variant="secondary" onClick={handleRecheck}>
        Recheck
      </Button>
    </BannerContainer>
  );
};

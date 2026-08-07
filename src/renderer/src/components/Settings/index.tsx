import React from 'react';
import styled from 'styled-components';

import { Button } from '../ui/Button.tsx';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: ${({ theme }) => theme.space[6]};
  gap: ${({ theme }) => theme.space[4]};
`;

const BackRow = styled.div`
  display: flex;
  align-items: center;
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: 600;
  color: ${({ theme }) => theme.text.primary};
  margin: 0;
`;

const Placeholder = styled.p`
  color: ${({ theme }) => theme.text.secondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

type SettingsProps = {
  onBack: () => void;
};

export const Settings = ({ onBack }: SettingsProps): React.JSX.Element => (
  <Wrapper>
    <BackRow>
      <Button variant="ghost" onClick={onBack}>
        ← Back
      </Button>
    </BackRow>
    <Title>Settings</Title>
    {/* Full settings UI implemented in M22 */}
    <Placeholder>Settings panel coming in M22.</Placeholder>
  </Wrapper>
);

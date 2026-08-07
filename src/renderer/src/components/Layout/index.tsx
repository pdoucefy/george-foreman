import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
`;

const LeftPanel = styled.div`
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid ${({ theme }) => theme.border.subtle};
  background: ${({ theme }) => theme.bg.panel};
`;

const RightPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ theme }) => theme.bg.app};
`;

type LayoutProps = {
  left: React.ReactNode;
  right: React.ReactNode;
};

export const Layout = ({ left, right }: LayoutProps): React.JSX.Element => (
  <Wrapper>
    <LeftPanel>{left}</LeftPanel>
    <RightPanel>{right}</RightPanel>
  </Wrapper>
);

import React from 'react';
import styled from 'styled-components';

type Orientation = 'horizontal' | 'vertical';

type SeparatorRootProps = {
  $orientation: Orientation;
};

const SeparatorRoot = styled.hr<SeparatorRootProps>`
  border: none;
  flex-shrink: 0;
  ${({ $orientation, theme }) =>
    $orientation === 'horizontal'
      ? `
        width: 100%;
        height: 1px;
        background-color: ${theme.border.subtle};
        margin: 0;
      `
      : `
        width: 1px;
        height: 100%;
        background-color: ${theme.border.subtle};
        margin: 0;
        display: inline-block;
        align-self: stretch;
      `}
`;

type SeparatorProps = {
  orientation?: Orientation;
  className?: string;
};

export const Separator = ({
  orientation = 'horizontal',
  className,
}: SeparatorProps): React.ReactElement => (
  <SeparatorRoot
    role="separator"
    aria-orientation={orientation}
    $orientation={orientation}
    className={className}
  />
);

import * as RadixSelect from '@radix-ui/react-select';

import { Check, ChevronDown } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { icon } from './Icon.tsx';

const ChevronDownIcon = icon(ChevronDown);
const CheckIcon = icon(Check);

// ─── Styled primitives ────────────────────────────────────────────────────────

const Trigger = styled(RadixSelect.Trigger)`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[3]};
  background-color: ${({ theme }) => theme.bg.input};
  color: ${({ theme }) => theme.text.primary};
  border: 1px solid ${({ theme }) => theme.border.default};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.fontSize.md};
  min-width: 160px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.border.strong};
  }
  &:focus {
    border-color: ${({ theme }) => theme.accent.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.accent.glow};
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &[data-placeholder] {
    color: ${({ theme }) => theme.text.disabled};
  }
`;

const Content = styled(RadixSelect.Content)`
  background-color: ${({ theme }) => theme.bg.elevated};
  border: 1px solid ${({ theme }) => theme.border.default};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.md};
  overflow: hidden;
  z-index: 100;
  min-width: var(--radix-select-trigger-width);
`;

const Viewport = styled(RadixSelect.Viewport)`
  padding: ${({ theme }) => theme.space[1]};
`;

const Item = styled(RadixSelect.Item)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.text.primary};
  cursor: pointer;
  outline: none;
  user-select: none;
  &[data-highlighted] {
    background-color: ${({ theme }) => theme.bg.card};
    color: ${({ theme }) => theme.text.primary};
  }
  &[data-disabled] {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export const Select = ({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  className,
}: SelectProps): React.ReactElement => (
  <RadixSelect.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange}>
    <Trigger disabled={disabled} className={className}>
      <RadixSelect.Value placeholder={placeholder} />
      <RadixSelect.Icon>
        <ChevronDownIcon size={14} />
      </RadixSelect.Icon>
    </Trigger>
    <RadixSelect.Portal>
      <Content position="popper" sideOffset={4}>
        <Viewport>
          {options.map((opt) => (
            <Item key={opt.value} value={opt.value} disabled={opt.disabled}>
              <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
              <RadixSelect.ItemIndicator>
                <CheckIcon size={12} />
              </RadixSelect.ItemIndicator>
            </Item>
          ))}
        </Viewport>
      </Content>
    </RadixSelect.Portal>
  </RadixSelect.Root>
);

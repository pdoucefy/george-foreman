import React from 'react';
import styled from 'styled-components';

import { FieldError, FieldLabel, FieldWrapper, fieldInputCss } from './fieldUtils.ts';

type StyledInputProps = {
  $hasError: boolean;
};

const StyledInput = styled.input<StyledInputProps>`
  ${fieldInputCss}
`;

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  error?: string;
};

export const TextInput = ({ id, label, error, ...props }: TextInputProps): React.ReactElement => (
  <FieldWrapper>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <StyledInput
      id={id}
      $hasError={!!error}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </FieldWrapper>
);

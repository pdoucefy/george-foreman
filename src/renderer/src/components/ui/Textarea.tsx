import React from 'react';
import styled from 'styled-components';

import { FieldError, FieldLabel, FieldWrapper, fieldInputCss } from './fieldUtils.ts';

type StyledTextareaProps = {
  $hasError: boolean;
};

const StyledTextarea = styled.textarea<StyledTextareaProps>`
  ${fieldInputCss}
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
`;

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  id: string;
  label: string;
  error?: string;
};

export const Textarea = ({ id, label, error, ...props }: TextareaProps): React.ReactElement => (
  <FieldWrapper>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <StyledTextarea
      id={id}
      $hasError={!!error}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </FieldWrapper>
);

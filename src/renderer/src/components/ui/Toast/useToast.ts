import { createContext, useContext } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastOptions = {
  message: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};

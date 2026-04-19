import { useCallback, useEffect } from 'react';
import { useErrorStore } from '../stores/errorStore';

interface UseFormErrorOptions {
  field: string;
  validate?: (value: unknown) => string | null;
}

export function useFormError({ field, validate }: UseFormErrorOptions) {
  const { getFieldError, clearFieldError, addError } = useErrorStore();
  const fieldError = getFieldError(field);

  const validateField = useCallback((value: unknown) => {
    if (!validate) return true;
    const error = validate(value);
    if (error) {
      clearFieldError(field);
      addError(error, 'error', field);
      return false;
    }
    clearFieldError(field);
    return true;
  }, [field, validate, addError, clearFieldError]);

  useEffect(() => {
    return () => {
      clearFieldError(field);
    };
  }, [field, clearFieldError]);

  return {
    error: fieldError,
    hasError: !!fieldError,
    validateField,
    clearError: () => clearFieldError(field),
  };
}

export function getInputErrorClass(hasError: boolean): string {
  return hasError
    ? 'border-red-500 dark:border-red-400 focus:ring-red-500 focus:border-red-500'
    : 'border-slate-200 dark:border-slate-600 focus:ring-blue-500';
}

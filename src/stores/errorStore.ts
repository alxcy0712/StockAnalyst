import { create } from 'zustand';

type ErrorType = 'error' | 'warning' | 'info';

interface ErrorItem {
  id: string;
  message: string;
  type: ErrorType;
  field?: string;
  duration?: number;
}

interface ErrorState {
  errors: ErrorItem[];
  addError: (message: string, type?: ErrorType, field?: string, duration?: number) => string;
  removeError: (id: string) => void;
  clearAll: () => void;
  getFieldError: (field: string) => ErrorItem | undefined;
  clearFieldError: (field: string) => void;
}

export const useErrorStore = create<ErrorState>((set, get) => ({
  errors: [],
  
  addError: (message, type = 'error', field, duration = 5000) => {
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const error: ErrorItem = { id, message, type, field, duration };
    
    set((state) => ({
      errors: [...state.errors, error],
    }));
    
    if (duration > 0) {
      setTimeout(() => {
        get().removeError(id);
      }, duration);
    }
    
    return id;
  },
  
  removeError: (id) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== id),
    }));
  },
  
  clearAll: () => set({ errors: [] }),
  
  getFieldError: (field) => {
    return get().errors.find((e) => e.field === field);
  },
  
  clearFieldError: (field) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.field !== field),
    }));
  },
}));

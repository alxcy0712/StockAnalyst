import { create } from 'zustand';

interface ExchangeState {
  rates: { CNY_HKD: number; CNY_USD: number } | null;
  updateTime: string | null;
  isLoading: boolean;
  setRates: (rates: { CNY_HKD: number; CNY_USD: number }) => void;
  setLoading: (loading: boolean) => void;
}

export const useExchangeStore = create<ExchangeState>((set) => ({
  rates: null,
  updateTime: null,
  isLoading: false,
  setRates: (rates) => set({ 
    rates, 
    updateTime: new Date().toLocaleString('zh-CN', { 
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    }).replace(/\//g, '/')
  }),
  setLoading: (loading) => set({ isLoading: loading }),
}));

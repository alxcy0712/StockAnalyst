import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BenchmarkIndex } from '../types';

interface BenchmarkState {
  selectedBenchmark: BenchmarkIndex;
  setBenchmark: (benchmark: BenchmarkIndex) => void;
}

export const useBenchmarkStore = create<BenchmarkState>()(
  persist(
    (set) => ({
      selectedBenchmark: 'csi300',
      setBenchmark: (benchmark) => set({ selectedBenchmark: benchmark }),
    }),
    {
      name: 'benchmark-storage',
    }
  )
);

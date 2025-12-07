import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TableState {
  pageSize: number;
  setPageSize: (size: number) => void;
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export const useTableStore = create<TableState>()(
  persist(
    (set) => ({
      pageSize: DEFAULT_PAGE_SIZE,
      setPageSize: (size) => set({ pageSize: size }),
    }),
    {
      name: 'table-preferences',
    }
  )
);

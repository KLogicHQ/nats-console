import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ClusterState {
  selectedClusterId: string | null;
  setSelectedClusterId: (clusterId: string | null) => void;
}

export const useClusterStore = create<ClusterState>()(
  persist(
    (set) => ({
      selectedClusterId: null,
      setSelectedClusterId: (clusterId) => set({ selectedClusterId: clusterId }),
    }),
    {
      name: 'cluster-storage',
    }
  )
);

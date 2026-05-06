import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  apiKey: string | null;
  model: string;
  setApiKey: (key: string | null) => void;
  setModel: (model: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: null,
      model: 'claude-sonnet-4-6',
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
    }),
    { name: 'gapviz-settings' },
  ),
);

interface UIState {
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;
}

export const useUI = create<UIState>((set) => ({
  activeProjectId: null,
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
}));

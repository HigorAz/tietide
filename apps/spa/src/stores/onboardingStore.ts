import { create } from 'zustand';

export type TourScope = 'firstAccess' | 'currentPage';

export interface OnboardingState {
  tourRun: boolean;
  tourScope: TourScope | null;
  tourStepIndex: number;
  helpDrawerOpen: boolean;
  cheatSheetOpen: boolean;
  welcomeOpen: boolean;
}

export interface OnboardingActions {
  startTour: (payload: { scope: TourScope }) => void;
  finishTour: () => void;
  setStepIndex: (index: number) => void;
  openHelpDrawer: () => void;
  closeHelpDrawer: () => void;
  openCheatSheet: () => void;
  closeCheatSheet: () => void;
  toggleCheatSheet: () => void;
  openWelcome: () => void;
  closeWelcome: () => void;
}

export type OnboardingStore = OnboardingState & OnboardingActions;

export const initialOnboardingState: OnboardingState = {
  tourRun: false,
  tourScope: null,
  tourStepIndex: 0,
  helpDrawerOpen: false,
  cheatSheetOpen: false,
  welcomeOpen: false,
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  ...initialOnboardingState,

  startTour: ({ scope }) => set({ tourRun: true, tourScope: scope, tourStepIndex: 0 }),
  finishTour: () => set({ tourRun: false, tourScope: null, tourStepIndex: 0 }),
  setStepIndex: (index) => set({ tourStepIndex: index }),
  openHelpDrawer: () => set({ helpDrawerOpen: true }),
  closeHelpDrawer: () => set({ helpDrawerOpen: false }),
  openCheatSheet: () => set({ cheatSheetOpen: true }),
  closeCheatSheet: () => set({ cheatSheetOpen: false }),
  toggleCheatSheet: () => set((s) => ({ cheatSheetOpen: !s.cheatSheetOpen })),
  openWelcome: () => set({ welcomeOpen: true }),
  closeWelcome: () => set({ welcomeOpen: false }),
}));

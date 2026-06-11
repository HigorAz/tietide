import { create } from 'zustand';

// The id of the tour currently running. Either a named per-route tour
// (`'home'`, `'editor'`, …) or the special stitched first-access sequence.
export const FIRST_ACCESS_TOUR_ID = 'firstAccess';

export interface OnboardingState {
  tourRun: boolean;
  activeTourId: string | null;
  tourStepIndex: number;
  helpDrawerOpen: boolean;
  cheatSheetOpen: boolean;
  welcomeOpen: boolean;
}

export interface OnboardingActions {
  startTour: (payload: { tourId: string }) => void;
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
  activeTourId: null,
  tourStepIndex: 0,
  helpDrawerOpen: false,
  cheatSheetOpen: false,
  welcomeOpen: false,
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  ...initialOnboardingState,

  startTour: ({ tourId }) => set({ tourRun: true, activeTourId: tourId, tourStepIndex: 0 }),
  finishTour: () => set({ tourRun: false, activeTourId: null, tourStepIndex: 0 }),
  setStepIndex: (index) => set({ tourStepIndex: index }),
  openHelpDrawer: () => set({ helpDrawerOpen: true }),
  closeHelpDrawer: () => set({ helpDrawerOpen: false }),
  openCheatSheet: () => set({ cheatSheetOpen: true }),
  closeCheatSheet: () => set({ cheatSheetOpen: false }),
  toggleCheatSheet: () => set((s) => ({ cheatSheetOpen: !s.cheatSheetOpen })),
  openWelcome: () => set({ welcomeOpen: true }),
  closeWelcome: () => set({ welcomeOpen: false }),
}));

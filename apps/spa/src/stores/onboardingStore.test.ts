import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore, initialOnboardingState } from './onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState(initialOnboardingState);
  });

  describe('initial state', () => {
    it('should start with the tour not running and no active tour', () => {
      const state = useOnboardingStore.getState();
      expect(state.tourRun).toBe(false);
      expect(state.activeTourId).toBeNull();
      expect(state.tourStepIndex).toBe(0);
    });

    it('should start with both panels closed', () => {
      const state = useOnboardingStore.getState();
      expect(state.helpDrawerOpen).toBe(false);
      expect(state.cheatSheetOpen).toBe(false);
    });

    it('should start with the welcome modal closed', () => {
      expect(useOnboardingStore.getState().welcomeOpen).toBe(false);
    });
  });

  describe('welcome modal', () => {
    it('should open and close the welcome modal', () => {
      useOnboardingStore.getState().openWelcome();
      expect(useOnboardingStore.getState().welcomeOpen).toBe(true);
      useOnboardingStore.getState().closeWelcome();
      expect(useOnboardingStore.getState().welcomeOpen).toBe(false);
    });
  });

  describe('startTour', () => {
    it('should set tourRun=true with the requested tourId and reset stepIndex', () => {
      useOnboardingStore.setState({ tourStepIndex: 4 });
      useOnboardingStore.getState().startTour({ tourId: 'firstAccess' });
      const state = useOnboardingStore.getState();
      expect(state.tourRun).toBe(true);
      expect(state.activeTourId).toBe('firstAccess');
      expect(state.tourStepIndex).toBe(0);
    });

    it('should start a named per-route tour (used by HelpDrawer "Take the tour")', () => {
      useOnboardingStore.getState().startTour({ tourId: 'editor' });
      expect(useOnboardingStore.getState().activeTourId).toBe('editor');
    });
  });

  describe('finishTour', () => {
    it('should clear run/activeTourId and reset stepIndex (tour is over either way)', () => {
      useOnboardingStore.setState({ tourRun: true, activeTourId: 'firstAccess', tourStepIndex: 3 });
      useOnboardingStore.getState().finishTour();
      const state = useOnboardingStore.getState();
      expect(state.tourRun).toBe(false);
      expect(state.activeTourId).toBeNull();
      expect(state.tourStepIndex).toBe(0);
    });
  });

  describe('setStepIndex', () => {
    it('should advance the step counter', () => {
      useOnboardingStore.getState().setStepIndex(3);
      expect(useOnboardingStore.getState().tourStepIndex).toBe(3);
    });
  });

  describe('help drawer', () => {
    it('should open and close the help drawer', () => {
      useOnboardingStore.getState().openHelpDrawer();
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(true);
      useOnboardingStore.getState().closeHelpDrawer();
      expect(useOnboardingStore.getState().helpDrawerOpen).toBe(false);
    });
  });

  describe('cheat sheet', () => {
    it('should open and close the cheat sheet', () => {
      useOnboardingStore.getState().openCheatSheet();
      expect(useOnboardingStore.getState().cheatSheetOpen).toBe(true);
      useOnboardingStore.getState().closeCheatSheet();
      expect(useOnboardingStore.getState().cheatSheetOpen).toBe(false);
    });

    it('should toggle the cheat sheet (used by F8 keybinding)', () => {
      useOnboardingStore.getState().toggleCheatSheet();
      expect(useOnboardingStore.getState().cheatSheetOpen).toBe(true);
      useOnboardingStore.getState().toggleCheatSheet();
      expect(useOnboardingStore.getState().cheatSheetOpen).toBe(false);
    });
  });
});

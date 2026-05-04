import { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboardingStore';

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'F8') return;
      event.preventDefault();
      useOnboardingStore.getState().toggleCheatSheet();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

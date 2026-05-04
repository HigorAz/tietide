import { useEffect } from 'react';
import { useBlocker, type Blocker } from 'react-router-dom';

export function useUnsavedChangesGuard(isDirty: boolean): Blocker {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      currentLocation.pathname !== nextLocation.pathname &&
      currentLocation.pathname.startsWith('/workflows/'),
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isDirty]);

  return blocker;
}

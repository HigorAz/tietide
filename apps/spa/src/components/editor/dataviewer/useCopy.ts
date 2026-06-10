import { useCallback } from 'react';
import { useToastStore } from '@/stores/toastStore';

export type CopyFn = (text: string, what: string) => Promise<void>;

/**
 * Clipboard-write + toast-confirmation hook for the dataviewer copy actions
 * (value / path). Centralizes the try/catch the InspectorRunPanel used inline so
 * every copy surface confirms identically and degrades gracefully when the
 * Clipboard API is unavailable (insecure origin, denied permission). Never throws.
 */
export function useCopy(): CopyFn {
  const show = useToastStore((s) => s.show);

  return useCallback(
    async (text: string, what: string): Promise<void> => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error('clipboard unavailable');
        }
        await navigator.clipboard.writeText(text);
        show({ tone: 'success', message: `Copied ${what}` });
      } catch {
        show({ tone: 'error', message: 'Copy failed — clipboard unavailable' });
      }
    },
    [show],
  );
}

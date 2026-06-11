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
      // Branch the failure message on the actual cause (IN-03): a missing API
      // (insecure origin) is genuinely "unavailable", while a writeText rejection
      // (denied permission, unfocused document) is just a failed copy — don't
      // assert "unavailable" for the latter.
      if (!navigator.clipboard?.writeText) {
        show({ tone: 'error', message: 'Copy failed — clipboard unavailable' });
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        show({ tone: 'success', message: `Copied ${what}` });
      } catch {
        show({ tone: 'error', message: 'Copy failed' });
      }
    },
    [show],
  );
}

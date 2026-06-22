import { useEffect, useState } from 'react';

/**
 * react-joyride is driven here as a *controlled* component (`run` + `stepIndex`).
 * When a step's target lives on a page that hasn't mounted yet — e.g. after a
 * route change, or the editor whose `data-tour` anchors appear only once the
 * workflow finishes loading — Joyride looks for the target immediately and the
 * tooltip fails to anchor (the step "disappears"). This hook reports whether the
 * current step's target is actually in the DOM so AppTour can hold `run` until
 * it is, then resume at the controlled step.
 *
 * Centered/concept steps (`target: 'body'`) and the idle state (`null`) are
 * always ready. A missing target is awaited via a MutationObserver, with a
 * fail-safe timeout that resolves ready anyway so a never-appearing target can
 * never hard-lock the tour.
 */
const DEFAULT_TIMEOUT_MS = 5000;

const isPresent = (selector: string | null): boolean => {
  if (selector === null || selector === 'body') return true;
  try {
    return Boolean(document.querySelector(selector));
  } catch {
    // An invalid selector should never wedge the tour — treat it as ready.
    return true;
  }
};

export function useElementReady(
  selector: string | null,
  enabled: boolean,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): boolean {
  const [ready, setReady] = useState(() => !enabled || isPresent(selector));

  useEffect(() => {
    if (!enabled || selector === null || selector === 'body') {
      setReady(true);
      return;
    }
    if (isPresent(selector)) {
      setReady(true);
      return;
    }

    setReady(false);

    const observer = new MutationObserver(() => {
      if (isPresent(selector)) {
        setReady(true);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Fail-safe: never leave the tour stuck waiting on a target that won't show.
    const timer = window.setTimeout(() => {
      observer.disconnect();
      setReady(true);
    }, timeoutMs);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [selector, enabled, timeoutMs]);

  return ready;
}

export default useElementReady;

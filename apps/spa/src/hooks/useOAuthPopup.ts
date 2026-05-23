import { useCallback, useRef } from 'react';
import { startOAuth as apiStartOAuth, type StartOAuthParams } from '@/api/connections';

export type OAuthPopupOutcome =
  | { status: 'success'; connectionId?: string }
  | { status: 'error'; message?: string }
  | { status: 'cancelled' }
  | { status: 'timeout' };

const POPUP_FEATURES = 'width=520,height=640,menubar=no,toolbar=no,location=yes';
const POPUP_NAME = 'tietide-oauth';
const BROADCAST_CHANNEL = 'tietide-oauth';
const POLL_INTERVAL_MS = 500;
const MAX_DURATION_MS = 5 * 60 * 1000;

export interface OAuthPopupApi {
  start: (params: StartOAuthParams) => Promise<OAuthPopupOutcome>;
}

/**
 * Opens the provider authorize URL in a popup and resolves when the
 * popup posts back via window.postMessage (origin-checked) or closes.
 *
 * The popup MUST be opened synchronously inside the click handler (before
 * any await) or browsers will block it. We open about:blank first and
 * navigate after the start API resolves.
 */
export function useOAuthPopup(): OAuthPopupApi {
  const inflightRef = useRef<boolean>(false);

  const start = useCallback(async (params: StartOAuthParams): Promise<OAuthPopupOutcome> => {
    if (inflightRef.current) {
      return { status: 'error', message: 'Another OAuth flow is already in progress' };
    }
    inflightRef.current = true;

    const popup = window.open('about:blank', POPUP_NAME, POPUP_FEATURES);
    if (!popup) {
      // Popup blocked — fall back to same-window redirect.
      try {
        const startResult = await apiStartOAuth(params);
        window.location.assign(startResult.redirectUrl);
        // Navigation in progress; this resolution is informational.
        return { status: 'error', message: 'Popup blocked. Redirecting in this tab…' };
      } finally {
        inflightRef.current = false;
      }
    }

    let startResult: { redirectUrl: string; state: string };
    try {
      startResult = await apiStartOAuth(params);
    } catch (err) {
      try {
        popup.close();
      } catch {
        // ignore
      }
      inflightRef.current = false;
      throw err;
    }

    try {
      popup.location.href = startResult.redirectUrl;
    } catch {
      // Some COOP environments throw on cross-origin location writes; the
      // popup will navigate anyway via the assignment retry.
      popup.location.assign?.(startResult.redirectUrl);
    }

    return new Promise<OAuthPopupOutcome>((resolve) => {
      const startedAt = Date.now();
      const expectedOrigin = window.location.origin;
      // BroadcastChannel covers the case where Chrome's COOP severs
      // `window.opener` during the provider redirect chain — the popup can no
      // longer postMessage back to us, so it broadcasts instead.
      const channel =
        typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BROADCAST_CHANNEL) : null;

      const finish = (outcome: OAuthPopupOutcome): void => {
        window.removeEventListener('message', handleMessage);
        channel?.removeEventListener('message', handleBroadcast);
        channel?.close();
        window.clearInterval(interval);
        inflightRef.current = false;
        resolve(outcome);
      };

      const ingest = (data: unknown): void => {
        if (!data || typeof data !== 'object') return;
        const d = data as {
          type?: unknown;
          status?: unknown;
          connectionId?: unknown;
          message?: unknown;
        };
        if (d.type !== 'tietide:oauth:done') return;
        if (d.status === 'success') {
          finish({
            status: 'success',
            connectionId: typeof d.connectionId === 'string' ? d.connectionId : undefined,
          });
        } else {
          finish({
            status: 'error',
            message: typeof d.message === 'string' ? d.message : undefined,
          });
        }
      };

      const handleMessage = (event: MessageEvent): void => {
        if (event.origin !== expectedOrigin) return;
        ingest(event.data);
      };

      // BroadcastChannel is same-origin by construction (browser-enforced) so
      // we trust its payload without an origin check.
      const handleBroadcast = (event: MessageEvent): void => {
        ingest(event.data);
      };

      const interval = window.setInterval(() => {
        if (popup.closed) {
          finish({ status: 'cancelled' });
          return;
        }
        if (Date.now() - startedAt > MAX_DURATION_MS) {
          try {
            popup.close();
          } catch {
            // ignore
          }
          finish({ status: 'timeout' });
        }
      }, POLL_INTERVAL_MS);

      window.addEventListener('message', handleMessage);
      channel?.addEventListener('message', handleBroadcast);
    });
  }, []);

  return { start };
}

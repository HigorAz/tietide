import { timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type SignatureInput,
  type ValidationInput,
  type ValidationResponse,
} from '@tietide/sdk';

/**
 * Shared base class for Microsoft Graph push triggers.
 *
 * Implements the two protocol-level pieces that are identical across every MS
 * Graph subscription resource:
 *
 * - {@link handleValidation}: echoes the `?validationToken=<token>` query
 *   parameter back as `text/plain` within the 10-second window MS Graph allows
 *   when creating a subscription. Runs BEFORE any DB lookup, since the
 *   challenge fires while {@link onActivate} is still in flight and no
 *   `ProviderSubscription` row exists yet.
 * - {@link verifySignature}: walks the notification envelope (`value[]` for
 *   the standard delivery shape; top-level fallback for legacy/dev posts) and
 *   timing-safe-compares the `clientState` field to the signingSecret stored
 *   on activation. This is MS Graph's HMAC equivalent.
 *
 * Concrete subclasses (`OutlookMessageReceivedTrigger`, etc.) only declare
 * `type` / `name` / `description` and the resource-specific {@link onActivate}
 * / {@link onDeactivate} bodies.
 */
export abstract class MicrosoftBaseTrigger extends BasePushTrigger {
  handleValidation(input: ValidationInput): ValidationResponse | null {
    const token = this.extractValidationToken(input.query);
    if (typeof token !== 'string' || token.length === 0) {
      return null;
    }
    return { body: token, contentType: 'text/plain' };
  }

  verifySignature(input: SignatureInput): boolean {
    const states = this.extractClientStates(input.rawBody);
    if (states.length === 0) return false;

    const expectedBuf = Buffer.from(input.signingSecret, 'utf8');
    return states.every((state) => {
      const providedBuf = Buffer.from(state, 'utf8');
      if (providedBuf.length !== expectedBuf.length) return false;
      return timingSafeEqual(providedBuf, expectedBuf);
    });
  }

  protected extractValidationToken(
    query: Record<string, string | string[] | undefined>,
  ): string | undefined {
    for (const [k, v] of Object.entries(query)) {
      if (k.toLowerCase() !== 'validationtoken') continue;
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    }
    return undefined;
  }

  /**
   * Pulls every `clientState` value out of the inbound MS Graph notification.
   * Standard shape: `{ value: [{ clientState, resource, ... }, ...] }`. Legacy
   * (single-notification) shape: top-level `{ clientState, resource, ... }`.
   * Returns an empty array if the body cannot be parsed or no states are
   * present — verifySignature treats that as a rejection.
   */
  protected extractClientStates(rawBody: Uint8Array): string[] {
    if (rawBody.length === 0) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(rawBody).toString('utf8'));
    } catch {
      return [];
    }
    if (!parsed || typeof parsed !== 'object') return [];

    const out: string[] = [];
    const root = parsed as { value?: unknown; clientState?: unknown };

    if (Array.isArray(root.value)) {
      for (const entry of root.value) {
        if (!entry || typeof entry !== 'object') continue;
        const cs = (entry as { clientState?: unknown }).clientState;
        if (typeof cs === 'string' && cs.length > 0) out.push(cs);
      }
    } else if (typeof root.clientState === 'string' && root.clientState.length > 0) {
      out.push(root.clientState);
    }
    return out;
  }

  protected extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== lower) continue;
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    }
    return null;
  }
}

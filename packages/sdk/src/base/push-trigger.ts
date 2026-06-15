import { BaseTrigger } from './base-trigger.js';
import type { NodeInput } from '../interfaces/node.interface.js';
import type {
  ActivationContext,
  ActivationResult,
  DeactivationContext,
  SignatureInput,
  ValidationInput,
  ValidationResponse,
} from '../interfaces/lifecycle.interface.js';

export abstract class BasePushTrigger extends BaseTrigger {
  abstract onActivate(ctx: ActivationContext): Promise<ActivationResult>;
  abstract onDeactivate(ctx: DeactivationContext): Promise<void>;
  abstract verifySignature(input: SignatureInput): boolean | Promise<boolean>;

  // Out-of-band URL ownership challenge (e.g. Microsoft Graph validationToken).
  // Returning a non-null response tells the webhook controller to short-circuit
  // the normal lookup/dispatch flow and reply with the supplied body. Returning
  // null means "not a challenge — proceed with the signed-event flow."
  handleValidation?(input: ValidationInput): ValidationResponse | null;

  // GET-based subscription verification handshake (e.g. Meta/Facebook webhooks:
  // GET ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<nonce>, which
  // expects the challenge echoed back as text/plain when the token matches). The
  // webhook controller's GET handler invokes this; a non-null response is echoed,
  // null/undefined means "not handled" → 404. Distinct from handleValidation,
  // which runs on the POST route for body-carrying challenges.
  handleSubscriptionVerification?(input: ValidationInput): ValidationResponse | null;

  protected async run(input: NodeInput): Promise<Record<string, unknown>> {
    const triggerData = input.data ?? {};
    return triggerData;
  }
}

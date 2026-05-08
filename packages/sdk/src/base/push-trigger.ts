import { BaseTrigger } from './base-trigger.js';
import type { NodeInput } from '../interfaces/node.interface.js';
import type {
  ActivationContext,
  ActivationResult,
  DeactivationContext,
  SignatureInput,
} from '../interfaces/lifecycle.interface.js';

export abstract class BasePushTrigger extends BaseTrigger {
  abstract onActivate(ctx: ActivationContext): Promise<ActivationResult>;
  abstract onDeactivate(ctx: DeactivationContext): Promise<void>;
  abstract verifySignature(input: SignatureInput): boolean | Promise<boolean>;

  protected async run(input: NodeInput): Promise<Record<string, unknown>> {
    const triggerData = input.data ?? {};
    return triggerData;
  }
}

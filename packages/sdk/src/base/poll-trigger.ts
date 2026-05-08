import { BaseTrigger } from './base-trigger.js';
import type { NodeInput } from '../interfaces/node.interface.js';
import type { PollContext, PollResult } from '../interfaces/lifecycle.interface.js';

export abstract class BasePollTrigger extends BaseTrigger {
  abstract readonly defaultIntervalSeconds: number;
  abstract poll(ctx: PollContext): Promise<PollResult>;

  protected async run(input: NodeInput): Promise<Record<string, unknown>> {
    const triggerData = input.data ?? {};
    return triggerData;
  }
}

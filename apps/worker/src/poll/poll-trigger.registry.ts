import { Injectable } from '@nestjs/common';
import type { BasePollTrigger } from '@tietide/sdk';
import { POLL_TRIGGER_TYPES, type PollTriggerType } from '@tietide/shared';

@Injectable()
export class PollTriggerRegistry {
  private readonly byType = new Map<PollTriggerType, BasePollTrigger>();

  register(triggerType: PollTriggerType, instance: BasePollTrigger): void {
    if (!POLL_TRIGGER_TYPES.includes(triggerType)) {
      throw new Error(`Unknown poll trigger type: ${triggerType}`);
    }
    this.byType.set(triggerType, instance);
  }

  get(triggerType: string): BasePollTrigger | null {
    return this.byType.get(triggerType as PollTriggerType) ?? null;
  }

  has(triggerType: string): boolean {
    return this.byType.has(triggerType as PollTriggerType);
  }
}

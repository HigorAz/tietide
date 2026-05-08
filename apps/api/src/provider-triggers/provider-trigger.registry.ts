import { Injectable } from '@nestjs/common';
import type { BasePushTrigger } from '@tietide/sdk';
import {
  PUSH_TRIGGER_TYPES,
  TRIGGER_TYPE_TO_PROVIDER,
  type PushTriggerType,
  type ProviderTriggerProvider,
} from '@tietide/shared';

@Injectable()
export class ProviderTriggerRegistry {
  private readonly byType = new Map<PushTriggerType, BasePushTrigger>();
  private readonly byProvider = new Map<ProviderTriggerProvider, BasePushTrigger>();

  register(triggerType: PushTriggerType, instance: BasePushTrigger): void {
    if (!PUSH_TRIGGER_TYPES.includes(triggerType)) {
      throw new Error(`Unknown push trigger type: ${triggerType}`);
    }
    this.byType.set(triggerType, instance);
    this.byProvider.set(TRIGGER_TYPE_TO_PROVIDER[triggerType], instance);
  }

  getByType(triggerType: string): BasePushTrigger | null {
    return this.byType.get(triggerType as PushTriggerType) ?? null;
  }

  getByProvider(provider: string): BasePushTrigger | null {
    return this.byProvider.get(provider as ProviderTriggerProvider) ?? null;
  }

  isPushTriggerType(value: string): boolean {
    return this.byType.has(value as PushTriggerType);
  }
}

import { Module } from '@nestjs/common';
import { ProviderTriggerRegistry } from './provider-trigger.registry';

@Module({
  providers: [ProviderTriggerRegistry],
  exports: [ProviderTriggerRegistry],
})
export class ProviderTriggerModule {}

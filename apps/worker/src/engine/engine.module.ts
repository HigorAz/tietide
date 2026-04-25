import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpRequestAction } from '../nodes/actions/http-request';
import { Conditional } from '../nodes/logic/conditional';
import { NodeRegistry } from '../nodes/registry';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { CronTrigger } from '../nodes/triggers/cron-trigger';
import { EngineService } from './engine.service';
import { WorkflowRunner } from './workflow-runner';
import { SECRET_RESOLVER, StubSecretResolver } from './secret-resolver';

@Module({
  providers: [
    NodeRegistry,
    WorkflowRunner,
    EngineService,
    ManualTrigger,
    CronTrigger,
    HttpRequestAction,
    Conditional,
    { provide: SECRET_RESOLVER, useClass: StubSecretResolver },
  ],
  exports: [EngineService, NodeRegistry],
})
export class EngineModule implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly manualTrigger: ManualTrigger,
    private readonly cronTrigger: CronTrigger,
    private readonly httpRequest: HttpRequestAction,
    private readonly conditional: Conditional,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.manualTrigger);
    this.registry.register(this.cronTrigger);
    this.registry.register(this.httpRequest);
    this.registry.register(this.conditional);
  }
}

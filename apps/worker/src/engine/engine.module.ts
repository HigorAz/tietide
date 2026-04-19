import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpRequestAction } from '../nodes/actions/http-request';
import { NodeRegistry } from '../nodes/registry';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { EngineService } from './engine.service';
import { WorkflowRunner } from './workflow-runner';
import { SECRET_RESOLVER, StubSecretResolver } from './secret-resolver';

@Module({
  providers: [
    NodeRegistry,
    WorkflowRunner,
    EngineService,
    ManualTrigger,
    HttpRequestAction,
    { provide: SECRET_RESOLVER, useClass: StubSecretResolver },
  ],
  exports: [EngineService, NodeRegistry],
})
export class EngineModule implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly manualTrigger: ManualTrigger,
    private readonly httpRequest: HttpRequestAction,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.manualTrigger);
    this.registry.register(this.httpRequest);
  }
}

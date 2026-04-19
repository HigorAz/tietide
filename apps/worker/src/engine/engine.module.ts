import { Module } from '@nestjs/common';
import { NodeRegistry } from '../nodes/registry';
import { EngineService } from './engine.service';
import { WorkflowRunner } from './workflow-runner';
import { SECRET_RESOLVER, StubSecretResolver } from './secret-resolver';

@Module({
  providers: [
    NodeRegistry,
    WorkflowRunner,
    EngineService,
    { provide: SECRET_RESOLVER, useClass: StubSecretResolver },
  ],
  exports: [EngineService, NodeRegistry],
})
export class EngineModule {}

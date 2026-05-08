import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpRequestAction } from '../nodes/actions/http-request';
import { Conditional } from '../nodes/logic/conditional';
import { IteratorNode } from '../nodes/logic/iterator';
import { ReturnNode } from '../nodes/logic/return';
import { SubworkflowAction } from '../nodes/logic/subworkflow';
import { NodeRegistry } from '../nodes/registry';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { CronTrigger } from '../nodes/triggers/cron-trigger';
import { WebhookTrigger } from '../nodes/triggers/webhook-trigger';
import { ExecutionEventsModule } from '../events/execution-events.module';
import { EngineService } from './engine.service';
import { WorkflowRunner } from './workflow-runner';
import { SECRET_RESOLVER } from './secret-resolver';
import { PrismaSecretResolver } from './prisma-secret-resolver';
import { ENV_VAR_RESOLVER } from './env-var-resolver';
import { PrismaEnvVarResolver } from './prisma-env-var-resolver';
import { CONNECTION_RESOLVER } from '../connections/connection-resolver';
import { PrismaConnectionResolver } from '../connections/prisma-connection-resolver';
import { OAuthRefreshModule } from '../connections/refresh/oauth-refresh.module';
import {
  DEFAULT_GOOGLE_CLIENTS,
  GOOGLE_CLIENTS,
  GoogleAuthService,
} from '../nodes/connectors/google/google-auth';
import { GmailSendAction } from '../nodes/connectors/google/gmail-send';

@Module({
  imports: [ExecutionEventsModule, OAuthRefreshModule],
  providers: [
    NodeRegistry,
    WorkflowRunner,
    EngineService,
    ManualTrigger,
    CronTrigger,
    WebhookTrigger,
    HttpRequestAction,
    Conditional,
    ReturnNode,
    IteratorNode,
    SubworkflowAction,
    GoogleAuthService,
    { provide: GOOGLE_CLIENTS, useValue: DEFAULT_GOOGLE_CLIENTS },
    GmailSendAction,
    { provide: SECRET_RESOLVER, useClass: PrismaSecretResolver },
    { provide: ENV_VAR_RESOLVER, useClass: PrismaEnvVarResolver },
    { provide: CONNECTION_RESOLVER, useClass: PrismaConnectionResolver },
  ],
  exports: [EngineService, NodeRegistry],
})
export class EngineModule implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly manualTrigger: ManualTrigger,
    private readonly cronTrigger: CronTrigger,
    private readonly webhookTrigger: WebhookTrigger,
    private readonly httpRequest: HttpRequestAction,
    private readonly conditional: Conditional,
    private readonly returnNode: ReturnNode,
    private readonly iteratorNode: IteratorNode,
    private readonly subworkflowAction: SubworkflowAction,
    private readonly gmailSend: GmailSendAction,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.manualTrigger);
    this.registry.register(this.cronTrigger);
    this.registry.register(this.webhookTrigger);
    this.registry.register(this.httpRequest);
    this.registry.register(this.conditional);
    this.registry.register(this.returnNode);
    this.registry.register(this.iteratorNode);
    this.registry.register(this.subworkflowAction);
    this.registry.register(this.gmailSend);
  }
}

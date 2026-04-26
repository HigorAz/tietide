import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowDocumentationController } from './workflow-documentation.controller';
import { WorkflowDocumentationService } from './workflow-documentation.service';

@Module({
  imports: [AiModule],
  controllers: [WorkflowsController, WorkflowDocumentationController],
  providers: [WorkflowsService, WorkflowDocumentationService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}

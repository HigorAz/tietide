import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowVersionsController } from './workflow-versions.controller';
import { WorkflowVersionsService } from './workflow-versions.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WorkflowVersionsController],
  providers: [WorkflowVersionsService],
  exports: [WorkflowVersionsService],
})
export class WorkflowVersionsModule {}

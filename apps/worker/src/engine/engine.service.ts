import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { WorkflowDefinition } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowRunner } from './workflow-runner';

export interface ExecutePayload {
  executionId: string;
  workflowId: string;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
}

@Injectable()
export class EngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorkflowRunner,
    private readonly log: Logger,
  ) {}

  async execute(payload: ExecutePayload): Promise<void> {
    const { executionId, workflowId, triggerData, requestId } = payload;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, definition: true },
    });

    if (!workflow) {
      await this.markFailed(executionId, `Workflow "${workflowId}" not found`);
      return;
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      const result = await this.runner.run({
        executionId,
        workflowId,
        definition: workflow.definition as unknown as WorkflowDefinition,
        triggerData,
      });

      if (result.status === 'SUCCESS') {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'SUCCESS', finishedAt: new Date() },
        });
      } else {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'FAILED',
            error: result.error ?? 'Unknown failure',
            finishedAt: new Date(),
          },
        });
      }
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error';
      this.log.error(
        { executionId, workflowId, requestId, err: message },
        `Runner crashed: ${message}`,
      );
      await this.markFailed(executionId, message);
    }
  }

  private async markFailed(executionId: string, error: string): Promise<void> {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', error, finishedAt: new Date() },
    });
  }
}

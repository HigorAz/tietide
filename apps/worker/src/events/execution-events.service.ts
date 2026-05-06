import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { sanitizePayload } from '@tietide/shared';
import { EXECUTION_EVENTS_PUBLISHER, executionChannel } from './execution-events.constants';
import type { ExecutionEventEnvelope } from './execution-events.types';

export interface RedisPublisher {
  publish(channel: string, message: string): Promise<number>;
}

export interface StepStartedArgs {
  executionId: string;
  nodeId: string;
  nodeType: string;
  startedAt: Date;
}

export interface StepCompletedArgs {
  executionId: string;
  nodeId: string;
  nodeType: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  input: unknown;
  output: unknown;
}

export interface StepFailedArgs {
  executionId: string;
  nodeId: string;
  nodeType: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  input: unknown;
  error: { message: string; code?: string };
}

export interface StepSkippedArgs {
  executionId: string;
  nodeId: string;
  nodeType: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  input: unknown;
  output: unknown;
}

export interface ExecutionCompletedArgs {
  executionId: string;
  finishedAt: Date;
  status: 'SUCCESS' | 'FAILED';
  error?: { message: string; code?: string };
}

// Best-effort lifecycle event publisher. Not durable: subscribers connecting
// after a step fired will miss it (consumer must seed initial state). The
// pub/sub layer is NOT a security boundary — authorization happens at the
// API WebSocket subscriber.
@Injectable()
export class ExecutionEventsService {
  constructor(
    @Inject(EXECUTION_EVENTS_PUBLISHER) private readonly publisher: RedisPublisher,
    private readonly logger: Logger,
  ) {}

  async publishStepStarted(args: StepStartedArgs): Promise<void> {
    const envelope: ExecutionEventEnvelope = {
      type: 'step.started',
      executionId: args.executionId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      status: 'RUNNING',
      startedAt: args.startedAt.toISOString(),
      finishedAt: null,
      durationMs: null,
      input: null,
      output: null,
      error: null,
    };
    await this.send(args.executionId, envelope);
  }

  async publishStepCompleted(args: StepCompletedArgs): Promise<void> {
    const envelope: ExecutionEventEnvelope = {
      type: 'step.completed',
      executionId: args.executionId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      status: 'SUCCESS',
      startedAt: args.startedAt.toISOString(),
      finishedAt: args.finishedAt.toISOString(),
      durationMs: args.durationMs,
      input: sanitizePayload(args.input),
      output: sanitizePayload(args.output),
      error: null,
    };
    await this.send(args.executionId, envelope);
  }

  async publishStepFailed(args: StepFailedArgs): Promise<void> {
    const envelope: ExecutionEventEnvelope = {
      type: 'step.failed',
      executionId: args.executionId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      status: 'FAILED',
      startedAt: args.startedAt.toISOString(),
      finishedAt: args.finishedAt.toISOString(),
      durationMs: args.durationMs,
      input: sanitizePayload(args.input),
      output: null,
      error: { message: args.error.message, code: args.error.code ?? null },
    };
    await this.send(args.executionId, envelope);
  }

  async publishStepSkipped(args: StepSkippedArgs): Promise<void> {
    const envelope: ExecutionEventEnvelope = {
      type: 'step.skipped',
      executionId: args.executionId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      status: 'SKIPPED',
      startedAt: args.startedAt.toISOString(),
      finishedAt: args.finishedAt.toISOString(),
      durationMs: args.durationMs,
      input: sanitizePayload(args.input),
      output: sanitizePayload(args.output),
      error: null,
    };
    await this.send(args.executionId, envelope);
  }

  async publishExecutionCompleted(args: ExecutionCompletedArgs): Promise<void> {
    const envelope: ExecutionEventEnvelope = {
      type: 'execution.completed',
      executionId: args.executionId,
      nodeId: null,
      nodeType: null,
      status: args.status,
      startedAt: null,
      finishedAt: args.finishedAt.toISOString(),
      durationMs: null,
      input: null,
      output: null,
      error: args.error ? { message: args.error.message, code: args.error.code ?? null } : null,
    };
    await this.send(args.executionId, envelope);
  }

  private async send(executionId: string, envelope: ExecutionEventEnvelope): Promise<void> {
    const channel = executionChannel(executionId);
    try {
      await this.publisher.publish(channel, JSON.stringify(envelope));
    } catch (err) {
      this.logger.warn(
        {
          executionId,
          channel,
          eventType: envelope.type,
          err: (err as Error).message,
        },
        'Failed to publish execution event; continuing',
      );
    }
  }
}

export { EXECUTION_EVENTS_PUBLISHER } from './execution-events.constants';

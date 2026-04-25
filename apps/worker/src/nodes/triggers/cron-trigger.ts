import { Injectable } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';

@Injectable()
export class CronTrigger implements INodeExecutor {
  readonly type = 'cron-trigger';
  readonly name = 'Cron Trigger';
  readonly description = 'Starts a workflow on a recurring schedule defined by a cron expression';
  readonly category = 'trigger' as const;

  async execute(input: NodeInput, _context: ExecutionContext): Promise<NodeOutput> {
    return { data: { ...input.data } };
  }
}

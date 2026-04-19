import { Injectable } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';

@Injectable()
export class ManualTrigger implements INodeExecutor {
  readonly type = 'manual-trigger';
  readonly name = 'Manual Trigger';
  readonly description = 'Starts a workflow manually with optional user-provided data';
  readonly category = 'trigger' as const;

  async execute(input: NodeInput, _context: ExecutionContext): Promise<NodeOutput> {
    return { data: { ...input.data } };
  }
}

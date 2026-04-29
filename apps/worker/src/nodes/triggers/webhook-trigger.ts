import { Injectable } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';

@Injectable()
export class WebhookTrigger implements INodeExecutor {
  readonly type = 'webhook-trigger';
  readonly name = 'Webhook Trigger';
  readonly description = 'Starts a workflow when an HTTP webhook is received';
  readonly category = 'trigger' as const;

  async execute(input: NodeInput, _context: ExecutionContext): Promise<NodeOutput> {
    return { data: { ...input.data } };
  }
}

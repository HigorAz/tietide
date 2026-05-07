import { Injectable } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeOutput } from '@tietide/sdk';
import { iteratorOutputSchema } from '@tietide/shared';

export const ITERATOR_NODE_TYPE = 'iterator';

@Injectable()
export class IteratorNode implements INodeExecutor {
  readonly type = ITERATOR_NODE_TYPE;
  readonly name = 'Iterator (For Each)';
  readonly description =
    'Runs the body subgraph once per item in an array. Each iteration spawns a child execution with the iteration scope as triggerData.';
  readonly category = 'logic' as const;
  readonly outputSchema = iteratorOutputSchema;

  // The runner special-cases iterator nodes so it can spawn child executions
  // and emit per-iteration progress events. This stub exists only so the
  // NodeRegistry recognizes the type. Calling execute() directly is a
  // programmer error.
  async execute(_: unknown, _ctx: ExecutionContext): Promise<NodeOutput> {
    throw new Error(
      'IteratorNode.execute should never be called: the WorkflowRunner orchestrates iterations.',
    );
  }
}

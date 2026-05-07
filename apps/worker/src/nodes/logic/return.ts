import { Injectable } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { returnOutputSchema } from '@tietide/shared';

export const RETURN_NODE_TYPE = 'return';

@Injectable()
export class ReturnNode implements INodeExecutor {
  readonly type = RETURN_NODE_TYPE;
  readonly name = 'Return';
  readonly description =
    'Marks the value to forward to a parent subworkflow caller. When no value is configured, the upstream node output is forwarded.';
  readonly category = 'logic' as const;
  readonly outputSchema = returnOutputSchema;

  async execute(input: NodeInput, _context: ExecutionContext): Promise<NodeOutput> {
    const value =
      'value' in input.params && input.params.value !== undefined ? input.params.value : input.data;

    return { data: { value } };
  }
}

import { Injectable } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { evaluateCondition, resolveTemplates } from './condition-evaluator';

@Injectable()
export class Conditional implements INodeExecutor {
  readonly type = 'conditional';
  readonly name = 'Conditional (IF)';
  readonly description =
    'Evaluates a condition against previous node output and routes execution to the true or false branch';
  readonly category = 'logic' as const;

  async execute(input: NodeInput, _context: ExecutionContext): Promise<NodeOutput> {
    const condition = this.parseCondition(input.params);
    const evaluatedCondition = resolveTemplates(condition, input.data);
    const branch = evaluateCondition(evaluatedCondition);

    return {
      data: {
        branch,
        evaluatedCondition,
      },
      metadata: {
        branch: branch ? 'true' : 'false',
      },
    };
  }

  private parseCondition(raw: Record<string, unknown>): string {
    const condition = raw.condition;
    if (typeof condition !== 'string' || condition.trim().length === 0) {
      throw new Error('Conditional node requires a non-empty "condition" parameter');
    }
    return condition;
  }
}

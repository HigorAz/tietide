import type { ExecutionContext } from '../interfaces/context.interface.js';
import type { INodeExecutor, NodeInput, NodeOutput } from '../interfaces/node.interface.js';

export abstract class BaseTrigger implements INodeExecutor {
  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly description: string;
  readonly category = 'trigger' as const;

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    this.validate(input);
    const result = await this.run(input, context);
    return this.transform(result);
  }

  protected abstract run(
    input: NodeInput,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>>;

  protected validate(_input: NodeInput): void {
    // Override in subclasses for custom validation
  }

  protected transform(result: Record<string, unknown>): NodeOutput {
    return { data: result };
  }
}

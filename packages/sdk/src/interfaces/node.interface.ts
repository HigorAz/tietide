import type { ExecutionContext } from './context.interface.js';

export interface OutputSchema {
  parse(value: unknown): unknown;
}

export interface NodeInput {
  data: Record<string, unknown>;
  params: Record<string, unknown>;
  credentials?: Record<string, string>;
  connectionId?: string;
}

export interface NodeOutput {
  data: Record<string, unknown>;
  metadata?: {
    statusCode?: number;
    duration?: number;
    [key: string]: unknown;
  };
}

export interface INodeExecutor {
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'trigger' | 'action' | 'logic';
  readonly outputSchema?: OutputSchema;
  readonly requiredConnectionType?: string;

  execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput>;
}

import type { ExecutionContext } from './context.interface.js';

export interface OutputSchema {
  parse(value: unknown): unknown;
}

export interface NodeInput {
  data: Record<string, unknown>;
  params: Record<string, unknown>;
  credentials?: Record<string, string>;
  connectionId?: string;
  /**
   * The full upstream output scope for this execution, keyed by source node id:
   * `{ [nodeId]: thatNode'sOutputData }`. This is the same scope that powers
   * `{{nodeId.field}}` template resolution. Whereas `data` is the (flattened)
   * last-predecessor output, `scope` exposes every already-executed node's output
   * so executors like the Code node can read sibling/ancestor results directly.
   * Optional and additive — executors that don't need it can ignore it.
   */
  scope?: Record<string, unknown>;
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

import { Injectable } from '@nestjs/common';
import type { INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';

/**
 * Worker-side stand-in for any push-trigger node type. Push trigger
 * activation/deactivation/verification all run in the API process.
 * Inside a workflow execution the trigger node is just a passthrough --
 * its job is to surface the inbound event payload (already on
 * input.data via triggerData) to the next node in the graph.
 */
export class PassthroughPushExecutor implements INodeExecutor {
  readonly category = 'trigger' as const;

  constructor(
    readonly type: string,
    readonly name: string,
    readonly description: string,
  ) {}

  async execute(input: NodeInput): Promise<NodeOutput> {
    return { data: input.data ?? {} };
  }
}

@Injectable()
export class StripeEventReceivedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'stripe-event-received',
      'Stripe: Event Received',
      'Triggers when Stripe delivers a webhook event to the workflow',
    );
  }
}

@Injectable()
export class DriveFileAddedPassthrough extends PassthroughPushExecutor {
  constructor() {
    super(
      'drive-file-added',
      'Drive: File Added',
      'Triggers when Google Drive notifies that a watched folder changed',
    );
  }
}

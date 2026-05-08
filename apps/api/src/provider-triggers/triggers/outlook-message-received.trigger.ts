import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { ActivationContext, ActivationResult, DeactivationContext } from '@tietide/sdk';
import { MicrosoftBaseTrigger } from './microsoft/microsoft-base.trigger';
import {
  MicrosoftGraphFactory,
  MicrosoftGraphHttpError,
} from './microsoft/microsoft-graph.factory';

export const OUTLOOK_MESSAGE_RECEIVED_TYPE = 'outlook-message-received';

// MS Graph caps mail subscriptions at 4230 minutes (~70.5 h). We request 4220
// so the hourly renewer (24 h lookahead) always has runway to rotate before
// the provider expires the subscription server-side.
const OUTLOOK_LIFETIME_MINUTES = 4220;

const INBOX_RESOURCE = "/me/mailFolders('Inbox')/messages";

interface OutlookConfig {
  filter?: unknown;
}

@Injectable()
export class OutlookMessageReceivedTrigger extends MicrosoftBaseTrigger {
  readonly type = OUTLOOK_MESSAGE_RECEIVED_TYPE;
  readonly name = 'Outlook: Message Received';
  readonly description =
    'Triggers when a new message arrives in the Outlook inbox (push, MS Graph subscription)';
  readonly requiredConnectionType = 'microsoft';

  private readonly log = new Logger(OutlookMessageReceivedTrigger.name);

  constructor(private readonly graph: MicrosoftGraphFactory) {
    super();
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = (ctx.config ?? {}) as OutlookConfig;
    const resource = buildInboxResource(typeof cfg.filter === 'string' ? cfg.filter : undefined);
    const clientState = randomBytes(32).toString('base64url');
    const expirationDateTime = new Date(
      Date.now() + OUTLOOK_LIFETIME_MINUTES * 60_000,
    ).toISOString();

    const requestBody = {
      changeType: 'created',
      notificationUrl: ctx.callbackUrl,
      resource,
      clientState,
      expirationDateTime,
    };

    const response = await this.graph.graphFetch<{
      id?: string;
      expirationDateTime?: string;
    }>(ctx.connection, '/v1.0/subscriptions', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const data = response.data ?? {};
    if (!data.id) {
      throw new Error('Microsoft Graph subscription response is missing id');
    }

    return {
      providerSubId: data.id,
      signingSecret: clientState,
      ...(data.expirationDateTime ? { expiresAt: new Date(data.expirationDateTime) } : {}),
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    try {
      await this.graph.graphFetch(ctx.connection, `/v1.0/subscriptions/${ctx.providerSubId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      if (err instanceof MicrosoftGraphHttpError && err.response.status === 404) {
        this.log.warn(
          { workflowId: ctx.workflowId, providerSubId: ctx.providerSubId },
          'Outlook subscription already deleted, skipping',
        );
        return;
      }
      throw err;
    }
  }
}

export function buildInboxResource(filter: string | undefined): string {
  if (!filter || filter.trim().length === 0) return INBOX_RESOURCE;
  return `${INBOX_RESOURCE}?$filter=${encodeURIComponent(filter)}`;
}

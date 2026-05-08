import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { ActivationContext, ActivationResult, DeactivationContext } from '@tietide/sdk';
import { MicrosoftBaseTrigger } from './microsoft/microsoft-base.trigger';
import {
  MicrosoftGraphFactory,
  MicrosoftGraphHttpError,
} from './microsoft/microsoft-graph.factory';

export const OUTLOOK_MESSAGE_FLAGGED_TYPE = 'outlook-message-flagged';

// Same 4230-min cap as inbox messages; we request 4220 for renewer headroom.
const OUTLOOK_LIFETIME_MINUTES = 4220;

const FLAGGED_FILTER = "flag/flagStatus eq 'flagged'";
const ALL_MESSAGES_RESOURCE = '/me/messages';

interface FlaggedConfig {
  filter?: unknown;
}

@Injectable()
export class OutlookMessageFlaggedTrigger extends MicrosoftBaseTrigger {
  readonly type = OUTLOOK_MESSAGE_FLAGGED_TYPE;
  readonly name = 'Outlook: Message Flagged';
  readonly description =
    'Triggers when an Outlook message is flagged for follow-up (push, MS Graph subscription on /me/messages with flag/flagStatus filter)';
  readonly requiredConnectionType = 'microsoft';

  private readonly log = new Logger(OutlookMessageFlaggedTrigger.name);

  constructor(private readonly graph: MicrosoftGraphFactory) {
    super();
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = (ctx.config ?? {}) as FlaggedConfig;
    const extra = typeof cfg.filter === 'string' ? cfg.filter : undefined;
    const resource = buildFlaggedResource(extra);

    const clientState = randomBytes(32).toString('base64url');
    const expirationDateTime = new Date(
      Date.now() + OUTLOOK_LIFETIME_MINUTES * 60_000,
    ).toISOString();

    const requestBody = {
      // Flagging an existing message is an update, not a creation.
      changeType: 'updated',
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
          'Outlook flagged subscription already deleted, skipping',
        );
        return;
      }
      throw err;
    }
  }
}

export function buildFlaggedResource(extraFilter: string | undefined): string {
  const merged =
    extraFilter && extraFilter.trim().length > 0
      ? `${FLAGGED_FILTER} and ${extraFilter}`
      : FLAGGED_FILTER;
  return `${ALL_MESSAGES_RESOURCE}?$filter=${encodeURIComponent(merged)}`;
}

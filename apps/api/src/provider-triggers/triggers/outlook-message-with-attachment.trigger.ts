import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { ActivationContext, ActivationResult, DeactivationContext } from '@tietide/sdk';
import { MicrosoftBaseTrigger } from './microsoft/microsoft-base.trigger';
import {
  MicrosoftGraphFactory,
  MicrosoftGraphHttpError,
} from './microsoft/microsoft-graph.factory';

export const OUTLOOK_MESSAGE_WITH_ATTACHMENT_TYPE = 'outlook-message-with-attachment';

// Same 4230-min cap as the other Outlook message subscriptions; request 4220
// to leave the renewer headroom.
const OUTLOOK_LIFETIME_MINUTES = 4220;

const HAS_ATTACHMENT_FILTER = 'hasAttachments eq true';
const INBOX_RESOURCE = "/me/mailFolders('Inbox')/messages";

interface AttachmentConfig {
  filter?: unknown;
}

@Injectable()
export class OutlookMessageWithAttachmentTrigger extends MicrosoftBaseTrigger {
  readonly type = OUTLOOK_MESSAGE_WITH_ATTACHMENT_TYPE;
  readonly name = 'Outlook: Message With Attachment';
  readonly description =
    'Triggers when a new Outlook inbox message with attachments arrives (push, MS Graph subscription on the Inbox with a hasAttachments filter)';
  readonly requiredConnectionType = 'microsoft';

  private readonly log = new Logger(OutlookMessageWithAttachmentTrigger.name);

  constructor(private readonly graph: MicrosoftGraphFactory) {
    super();
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = (ctx.config ?? {}) as AttachmentConfig;
    const extra = typeof cfg.filter === 'string' ? cfg.filter : undefined;
    const resource = buildAttachmentResource(extra);

    const clientState = randomBytes(32).toString('base64url');
    const expirationDateTime = new Date(
      Date.now() + OUTLOOK_LIFETIME_MINUTES * 60_000,
    ).toISOString();

    const requestBody = {
      // New inbox messages with attachments are creations.
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
          'Outlook with-attachment subscription already deleted, skipping',
        );
        return;
      }
      throw err;
    }
  }
}

export function buildAttachmentResource(extraFilter: string | undefined): string {
  const merged =
    extraFilter && extraFilter.trim().length > 0
      ? `${HAS_ATTACHMENT_FILTER} and ${extraFilter}`
      : HAS_ATTACHMENT_FILTER;
  return `${INBOX_RESOURCE}?$filter=${encodeURIComponent(merged)}`;
}

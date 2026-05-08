import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { ActivationContext, ActivationResult, DeactivationContext } from '@tietide/sdk';
import { MicrosoftBaseTrigger } from './microsoft/microsoft-base.trigger';
import {
  MicrosoftGraphFactory,
  MicrosoftGraphHttpError,
} from './microsoft/microsoft-graph.factory';

export const ONEDRIVE_FILE_ADDED_TYPE = 'onedrive-file-added';

// MS Graph drive subscriptions max out at ~30 days. We request 29 days
// (41 760 min) so the hourly renewer (24 h lookahead) always rotates before
// expiry.
const ONEDRIVE_LIFETIME_MINUTES = 41_760;
const DRIVE_RESOURCE = '/me/drive/root';

interface OnedriveConfig {
  // Stored on the subscription for the worker-side executor to filter on; the
  // /me/drive/root resource itself cannot be path-scoped without admin scopes.
  folderPath?: unknown;
}

@Injectable()
export class OnedriveFileAddedTrigger extends MicrosoftBaseTrigger {
  readonly type = ONEDRIVE_FILE_ADDED_TYPE;
  readonly name = 'OneDrive: File Added';
  readonly description =
    'Triggers when a file is added or modified in OneDrive (push, MS Graph subscription on /me/drive/root)';
  readonly requiredConnectionType = 'microsoft';

  private readonly log = new Logger(OnedriveFileAddedTrigger.name);

  constructor(private readonly graph: MicrosoftGraphFactory) {
    super();
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    // OneDrive does not deliver `created` for /me/drive/root — only `updated`.
    // Adding a file produces an updated notification on the parent folder.
    // The worker executor walks the delta to surface only "new" items.
    void (ctx.config as OnedriveConfig).folderPath;

    const clientState = randomBytes(32).toString('base64url');
    const expirationDateTime = new Date(
      Date.now() + ONEDRIVE_LIFETIME_MINUTES * 60_000,
    ).toISOString();

    const requestBody = {
      changeType: 'updated',
      notificationUrl: ctx.callbackUrl,
      resource: DRIVE_RESOURCE,
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
          'OneDrive subscription already deleted, skipping',
        );
        return;
      }
      throw err;
    }
  }
}

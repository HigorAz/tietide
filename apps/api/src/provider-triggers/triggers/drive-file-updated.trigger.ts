import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';
import { GoogleClientFactory } from './google/google-client.factory';

export const DRIVE_FILE_UPDATED_TYPE = 'drive-file-updated';

// Drive watch channels max out at 7 days. We cap at 6.5 days so the hourly
// renewer (24h lookahead) always has runway to rotate the channel.
const CHANNEL_LIFETIME_MS = 6.5 * 24 * 60 * 60 * 1000;

interface DriveNodeConfig {
  fileId?: unknown;
}

interface DriveErrorLike {
  code?: number | string;
}

@Injectable()
export class DriveFileUpdatedTrigger extends BasePushTrigger {
  readonly type = DRIVE_FILE_UPDATED_TYPE;
  readonly name = 'Drive: File Updated';
  readonly description =
    'Triggers when Google Drive notifies that a watched file was modified (push, watch channel)';

  private readonly log = new Logger(DriveFileUpdatedTrigger.name);

  constructor(private readonly google: GoogleClientFactory) {
    super();
  }

  verifySignature(input: SignatureInput): boolean {
    const provided = this.extractHeader(input.headers, 'x-goog-channel-token');
    if (!provided) return false;

    const expectedBuf = Buffer.from(input.signingSecret, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = (ctx.config ?? {}) as DriveNodeConfig;
    const fileId = cfg.fileId;
    if (typeof fileId !== 'string' || fileId.length === 0) {
      throw new Error('drive-file-updated requires config.fileId');
    }

    const channelId = randomBytes(16).toString('hex');
    const signingSecret = randomBytes(32).toString('base64url');
    const expirationMs = Date.now() + CHANNEL_LIFETIME_MS;

    const client = this.google.drive(ctx.connection);
    const response = await client.files.watch({
      fileId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: ctx.callbackUrl,
        token: signingSecret,
        expiration: String(expirationMs),
      },
    });

    const data = response.data as {
      id?: string | null;
      resourceId?: string | null;
      expiration?: string | null;
    };
    if (!data.id || !data.resourceId) {
      throw new Error('Drive watch response missing id or resourceId');
    }

    const expiresAt = data.expiration ? new Date(Number(data.expiration)) : new Date(expirationMs);

    return {
      providerSubId: `${data.id}|${data.resourceId}`,
      signingSecret,
      expiresAt,
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const sep = ctx.providerSubId.indexOf('|');
    if (sep === -1) {
      throw new Error(
        `drive-file-updated providerSubId is malformed (expected composite "<id>|<resourceId>")`,
      );
    }
    const id = ctx.providerSubId.slice(0, sep);
    const resourceId = ctx.providerSubId.slice(sep + 1);

    const client = this.google.drive(ctx.connection);
    try {
      await client.channels.stop({ requestBody: { id, resourceId } });
    } catch (err) {
      const code = (err as DriveErrorLike).code;
      if (code === 404 || code === '404') {
        this.log.warn(
          { providerSubId: ctx.providerSubId, workflowId: ctx.workflowId },
          'Drive channel already stopped, skipping',
        );
        return;
      }
      throw err;
    }
  }

  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== lower) continue;
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
    }
    return null;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, verify } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
  type ValidationInput,
  type ValidationResponse,
} from '@tietide/sdk';
import { DiscordApiError, DiscordBotClientFactory } from './discord-bot-client.factory';

export const DISCORD_MESSAGE_RECEIVED_TYPE = 'discord-message-received';

interface DiscordBotConfig {
  applicationId: string;
  publicKey: string; // hex-encoded raw 32-byte ed25519 public key
  botToken: string;
}

interface DiscordMessageReceivedNodeConfig {
  commandName?: string;
  guildId?: string;
}

// SubjectPublicKeyInfo (SPKI) DER prefix for an Ed25519 public key. Discord
// gives us the 32-byte raw key; Node's createPublicKey requires SPKI/DER, so
// we wrap the raw key with this constant prefix.
const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

// signingSecret format is "<publicKeyHex>" — that's all we need for verify.
// providerSubId stores the registered command id so we can DELETE on deactivate.
// providerSubId format: "<commandId>:<scope>" where scope is "guild:<id>" | "global".

@Injectable()
export class DiscordMessageReceivedTrigger extends BasePushTrigger {
  readonly type = DISCORD_MESSAGE_RECEIVED_TYPE;
  readonly name = 'Discord: Slash Command Received';
  readonly description = 'Triggers when a Discord slash command interaction is delivered';

  private readonly log = new Logger(DiscordMessageReceivedTrigger.name);

  constructor(private readonly discord: DiscordBotClientFactory) {
    super();
  }

  // Discord PING handshake: when the user saves the Interactions Endpoint URL
  // in Discord's dashboard Discord sends a signed PING. Until our subscription
  // is looked up we don't have the public key in this method, so we cannot
  // verify the signature here. We respond with PONG anyway because Discord
  // requires the handshake to succeed before they accept the URL. The signed
  // path runs verifySignature on every subsequent interaction.
  handleValidation(input: ValidationInput): ValidationResponse | null {
    if (input.rawBody.byteLength === 0) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(input.rawBody).toString('utf8'));
    } catch {
      return null;
    }
    const obj = parsed as { type?: unknown } | null;
    if (obj && obj.type === 1) {
      // PONG response. Note: Discord verifies our endpoint signed-handshake
      // semantics by re-issuing PING after each save; this branch covers both.
      return { body: JSON.stringify({ type: 1 }), contentType: 'application/json' };
    }
    return null;
  }

  // Ed25519 verify(timestamp || rawBody, signature, publicKey).
  verifySignature(input: SignatureInput): boolean {
    const sigHex = this.extractHeader(input.headers, 'x-signature-ed25519');
    const timestamp = this.extractHeader(input.headers, 'x-signature-timestamp');
    if (!sigHex || !timestamp) return false;
    if (!/^[0-9a-fA-F]+$/.test(sigHex) || sigHex.length !== 128) return false;
    if (!/^[0-9a-fA-F]+$/.test(input.signingSecret)) return false;
    if (input.signingSecret.length !== 64) return false;

    let publicKey;
    try {
      const der = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(input.signingSecret, 'hex')]);
      publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'Discord publicKey parse failed');
      return false;
    }

    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(input.rawBody)]);
    const signature = Buffer.from(sigHex, 'hex');
    try {
      return verify(null, message, publicKey, signature);
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'Discord verify threw');
      return false;
    }
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const conn = ctx.connection.config as unknown as DiscordBotConfig;
    const node = (ctx.config ?? {}) as DiscordMessageReceivedNodeConfig;
    const commandName = node.commandName ?? 'tietide-trigger';

    const path = node.guildId
      ? `/applications/${conn.applicationId}/guilds/${node.guildId}/commands`
      : `/applications/${conn.applicationId}/commands`;

    const response = await this.discord.call<{ id?: string }>(conn.botToken, 'POST', path, {
      name: commandName,
      description: 'TieTide workflow trigger',
      type: 1,
    });
    const commandId = response.data?.id;
    if (typeof commandId !== 'string') {
      throw new Error('Discord did not return a command id on registration');
    }

    const scope = node.guildId ? `guild:${node.guildId}` : 'global';
    return {
      providerSubId: `${commandId}:${scope}`,
      signingSecret: conn.publicKey,
    };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const conn = ctx.connection.config as unknown as DiscordBotConfig;
    const sep = ctx.providerSubId.indexOf(':');
    if (sep === -1) return;
    const commandId = ctx.providerSubId.slice(0, sep);
    const scope = ctx.providerSubId.slice(sep + 1);
    if (!commandId || !scope) return;

    const path = scope.startsWith('guild:')
      ? `/applications/${conn.applicationId}/guilds/${scope.slice('guild:'.length)}/commands/${commandId}`
      : `/applications/${conn.applicationId}/commands/${commandId}`;

    try {
      await this.discord.call(conn.botToken, 'DELETE', path);
    } catch (err) {
      if (err instanceof DiscordApiError && err.response.status === 404) {
        this.log.warn(
          { providerSubId: ctx.providerSubId, workflowId: ctx.workflowId },
          'Discord command already deleted',
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

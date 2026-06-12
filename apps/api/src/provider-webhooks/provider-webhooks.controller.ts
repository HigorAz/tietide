import {
  Controller,
  Head,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { ProviderWebhookResponseDto } from './dto/provider-webhook-response.dto';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';
import {
  DEFAULT_WEBHOOK_THROTTLE_LIMIT,
  DEFAULT_WEBHOOK_THROTTLE_TTL_MS,
  IP_THROTTLER_NAME,
} from '../common/throttler/throttler.config';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('provider-webhooks')
// W5.10: public, unauthenticated ingress. Each POST does a Prisma findUnique
// and (on a valid sub) a libsodium decrypt of the signing secret BEFORE the
// signature is verified. Previously @SkipThrottle() (never limited) — replaced
// with a generous-but-bounded per-IP cap via the `ip` named throttler so a
// flood of arbitrary :subscriptionId values can't drive unbounded pre-auth DB
// lookups + decrypts. Real providers fan out across many IPs, so 300/IP/min
// leaves legitimate webhook bursts untouched.
@Throttle({
  [IP_THROTTLER_NAME]: {
    ttl: DEFAULT_WEBHOOK_THROTTLE_TTL_MS,
    limit: DEFAULT_WEBHOOK_THROTTLE_LIMIT,
  },
})
@Controller('provider-webhooks')
export class ProviderWebhooksController {
  constructor(
    private readonly providerWebhooks: ProviderWebhooksService,
    private readonly registry: ProviderTriggerRegistry,
  ) {}

  // Trello pings the webhook URL with a HEAD request before creating the
  // webhook to confirm reachability — answer 200 unconditionally. We
  // intentionally do not consult any database state here so the URL is
  // reachable before onActivate has had a chance to write the
  // ProviderSubscription row. Other providers that send GET/HEAD challenges
  // (e.g. Microsoft Graph's validationToken) use a separate handleValidation
  // path on the existing POST route.
  @Head(':provider/:subscriptionId')
  @HttpCode(HttpStatus.OK)
  reachabilityCheck(): void {
    return;
  }

  @Post(':provider/:subscriptionId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Receive a signed event from an external provider (public, signature-protected)',
  })
  @ApiAcceptedResponse({ type: ProviderWebhookResponseDto })
  // A bad signature returns the same generic 404 as a missing/inactive/
  // mismatched subscription so the response cannot be used as a
  // subscription-existence oracle (W5.30). The real reason is logged internally.
  @ApiNotFoundResponse({ description: 'Provider webhook not found' })
  async receive(
    @Param('provider') provider: string,
    @Param('subscriptionId') subscriptionId: string,
    @Query() query: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest & { id?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProviderWebhookResponseDto | undefined> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);

    // Out-of-band URL-ownership challenges (currently MS Graph's
    // ?validationToken= echo). These fire while onActivate is still in
    // flight — no ProviderSubscription row exists yet — so we MUST answer
    // before consulting the database. Triggers that don't need a challenge
    // (Stripe, Drive, Gmail) leave handleValidation undefined and the call
    // falls through.
    const trigger = this.registry.getByProvider(provider);
    if (trigger?.handleValidation) {
      const validation = trigger.handleValidation({ query, headers, rawBody });
      if (validation) {
        res.status(HttpStatus.OK).type(validation.contentType).send(validation.body);
        return undefined;
      }
    }

    const result = await this.providerWebhooks.trigger({
      provider,
      subscriptionId,
      rawBody,
      headers,
      query,
      requestId: extractRequestId(req),
    });

    // Verified handshake (e.g. Discord PING): reply with the PONG body and 200
    // rather than the 202 ack envelope. The signature was already validated, so
    // bad-signature probes never reach here (they get the uniform 404 in the
    // service — same response as a missing subscription, no existence oracle).
    if (result.ack) {
      res.status(HttpStatus.OK).type(result.ack.contentType).send(result.ack.body);
      return undefined;
    }

    return result;
  }
}

function extractRequestId(req: Request & { id?: string }): string | undefined {
  if (typeof req.id === 'string' && req.id.length > 0) return req.id;
  const header = req.headers?.['x-request-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  return undefined;
}

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
import {
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { ProviderWebhookResponseDto } from './dto/provider-webhook-response.dto';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('provider-webhooks')
@SkipThrottle()
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
  @ApiUnauthorizedResponse({ description: 'Invalid signature' })
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

    return this.providerWebhooks.trigger({
      provider,
      subscriptionId,
      rawBody,
      headers,
      requestId: extractRequestId(req),
    });
  }
}

function extractRequestId(req: Request & { id?: string }): string | undefined {
  if (typeof req.id === 'string' && req.id.length > 0) return req.id;
  const header = req.headers?.['x-request-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  return undefined;
}

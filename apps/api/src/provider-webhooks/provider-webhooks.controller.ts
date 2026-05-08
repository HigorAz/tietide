import { Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { ProviderWebhookResponseDto } from './dto/provider-webhook-response.dto';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('provider-webhooks')
@SkipThrottle()
@Controller('provider-webhooks')
export class ProviderWebhooksController {
  constructor(private readonly providerWebhooks: ProviderWebhooksService) {}

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
    @Req() req: RawBodyRequest & { id?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<ProviderWebhookResponseDto> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
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

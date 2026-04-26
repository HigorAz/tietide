import { Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { WebhookTriggerResponseDto } from './dto/webhook-trigger-response.dto';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post(':path')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger a workflow via inbound webhook (HMAC-protected, public)',
  })
  @ApiHeader({
    name: 'x-webhook-signature',
    required: true,
    description: 'Hex-encoded HMAC-SHA256 of `${timestamp}.${rawBody}` using the webhook secret',
  })
  @ApiHeader({
    name: 'x-webhook-timestamp',
    required: true,
    description: 'Unix seconds — rejected if outside the replay window',
  })
  @ApiAcceptedResponse({ type: WebhookTriggerResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired signature' })
  @ApiNotFoundResponse({ description: 'Webhook not found or inactive' })
  async trigger(
    @Param('path') path: string,
    @Req() req: RawBodyRequest & { id?: string },
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-timestamp') timestamp: string | undefined,
  ): Promise<WebhookTriggerResponseDto> {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    return this.webhooks.trigger({
      path,
      rawBody,
      signature: signature?.trim() || undefined,
      timestamp: timestamp?.trim() || undefined,
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

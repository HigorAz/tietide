import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import type { OrgContext } from '../common/org-context/org-context.types';
import { ProviderSubscriptionsService } from './provider-subscriptions.service';
import { ProviderSubscriptionResponseDto } from './dto/provider-subscription-response.dto';

@ApiTags('provider-subscriptions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard)
@Controller('workflows/:workflowId/provider-subscriptions')
export class ProviderSubscriptionsController {
  constructor(private readonly service: ProviderSubscriptionsService) {}

  @Get()
  @ApiOperation({
    summary:
      "List a workflow's provider-webhook subscriptions with callback URLs (e.g. Discord Interactions Endpoint URL)",
  })
  @ApiOkResponse({ type: ProviderSubscriptionResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  async list(
    @CurrentOrg() org: OrgContext,
    @Param('workflowId', new ParseUUIDPipe({ version: '4' })) workflowId: string,
  ): Promise<ProviderSubscriptionResponseDto[]> {
    return this.service.listForWorkflow(org.id, workflowId);
  }
}

import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ProviderSubscriptionsService } from './provider-subscriptions.service';
import { ProviderSubscriptionResponseDto } from './dto/provider-subscription-response.dto';

@ApiTags('provider-subscriptions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('workflowId', new ParseUUIDPipe({ version: '4' })) workflowId: string,
  ): Promise<ProviderSubscriptionResponseDto[]> {
    return this.service.listForWorkflow(user.id, workflowId);
  }
}

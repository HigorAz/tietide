import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ExecutionsService } from './executions.service';
import { AllExecutionsQueryDto } from './dto/all-executions-query.dto';
import { ExecutionListResponseDto } from './dto/execution-detail-response.dto';

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('executions')
export class AllExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the caller’s executions across all workflows (paginated, filterable)',
  })
  @ApiOkResponse({ type: ExecutionListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AllExecutionsQueryDto,
  ): Promise<ExecutionListResponseDto> {
    return this.executions.listAllForUser(user.id, {
      status: query.status,
      workflowId: query.workflowId,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize ?? query.limit,
    });
  }
}

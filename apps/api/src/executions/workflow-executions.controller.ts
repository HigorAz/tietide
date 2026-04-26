import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ExecutionsService } from './executions.service';
import { ExecutionQueryDto } from './dto/execution-query.dto';
import { ExecutionListResponseDto } from './dto/execution-detail-response.dto';

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('workflows/:id/executions')
export class WorkflowExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get()
  @ApiOperation({ summary: 'List executions for a workflow (paginated, filterable)' })
  @ApiOkResponse({ type: ExecutionListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) workflowId: string,
    @Query() query: ExecutionQueryDto,
  ): Promise<ExecutionListResponseDto> {
    return this.executions.list(user.id, workflowId, {
      status: query.status,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}

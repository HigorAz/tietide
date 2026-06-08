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
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { OrgRolesGuard } from '../common/guards/org-roles.guard';
import type { OrgContext } from '../common/org-context/org-context.types';
import { ExecutionsService } from './executions.service';
import { ExecutionQueryDto } from './dto/execution-query.dto';
import { ExecutionListResponseDto } from './dto/execution-detail-response.dto';

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
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
    @CurrentOrg() org: OrgContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) workflowId: string,
    @Query() query: ExecutionQueryDto,
  ): Promise<ExecutionListResponseDto> {
    return this.executions.list(org.id, workflowId, {
      status: query.status,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}

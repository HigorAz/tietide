import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { AllExecutionsQueryDto } from './dto/all-executions-query.dto';
import { ExecutionListResponseDto } from './dto/execution-detail-response.dto';

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('executions')
export class AllExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get()
  @ApiOperation({
    summary: "List the active workspace's executions across all workflows (paginated, filterable)",
  })
  @ApiOkResponse({ type: ExecutionListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  async list(
    @CurrentOrg() org: OrgContext,
    @Query() query: AllExecutionsQueryDto,
  ): Promise<ExecutionListResponseDto> {
    return this.executions.listAllForOrg(org.id, {
      status: query.status,
      workflowId: query.workflowId,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize ?? query.limit,
      cursor: query.cursor,
    });
  }
}

import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
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
import { ExecutionDetailResponseDto } from './dto/execution-detail-response.dto';
import { ExecutionStepResponseDto } from './dto/execution-step-response.dto';

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('executions')
export class ExecutionDetailController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Fetch execution detail' })
  @ApiOkResponse({ type: ExecutionDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Execution not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this execution' })
  async findOne(
    @CurrentOrg() org: OrgContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) executionId: string,
  ): Promise<ExecutionDetailResponseDto> {
    return this.executions.findOne(org.id, executionId);
  }

  @Get(':id/steps')
  @ApiOperation({ summary: 'List per-node execution steps (sanitized payloads)' })
  @ApiOkResponse({ type: ExecutionStepResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Execution not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this execution' })
  async listSteps(
    @CurrentOrg() org: OrgContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) executionId: string,
  ): Promise<ExecutionStepResponseDto[]> {
    return this.executions.listSteps(org.id, executionId);
  }
}

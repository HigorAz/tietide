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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ExecutionsService } from './executions.service';
import { ExecutionDetailResponseDto } from './dto/execution-detail-response.dto';
import { ExecutionStepResponseDto } from './dto/execution-step-response.dto';

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('executions')
export class ExecutionDetailController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Fetch execution detail' })
  @ApiOkResponse({ type: ExecutionDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Execution not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this execution' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) executionId: string,
  ): Promise<ExecutionDetailResponseDto> {
    return this.executions.findOne(user.id, executionId);
  }

  @Get(':id/steps')
  @ApiOperation({ summary: 'List per-node execution steps (sanitized payloads)' })
  @ApiOkResponse({ type: ExecutionStepResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Execution not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this execution' })
  async listSteps(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) executionId: string,
  ): Promise<ExecutionStepResponseDto[]> {
    return this.executions.listSteps(user.id, executionId);
  }
}

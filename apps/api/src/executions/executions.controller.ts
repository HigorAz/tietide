import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { WorkflowDefinition } from '@tietide/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  DEFAULT_THROTTLER_NAME,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
} from '../common/throttler/throttler.config';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ExecutionsService } from './executions.service';
import { TriggerExecutionDto } from './dto/trigger-execution.dto';
import { TestExecutionDto } from './dto/test-execution.dto';
import { ExecutionResponseDto } from './dto/execution-response.dto';

const EXECUTE_THROTTLE = {
  [DEFAULT_THROTTLER_NAME]: {
    ttl: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
    limit: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  },
} as const;

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('workflows/:id')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post('execute')
  @Throttle(EXECUTE_THROTTLE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Manually trigger a workflow execution' })
  @ApiAcceptedResponse({
    type: ExecutionResponseDto,
    description: 'Execution accepted and enqueued',
  })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Repeated requests with the same key return the same execution.',
  })
  async trigger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TriggerExecutionDto,
    @Req() req: Request & { id?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ExecutionResponseDto> {
    return this.executions.triggerManual(user.id, id, {
      triggerData: dto.triggerData,
      idempotencyKey: idempotencyKey?.trim() || undefined,
      requestId: extractRequestId(req),
    });
  }

  @Post('test')
  @Throttle(EXECUTE_THROTTLE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Run an in-memory workflow definition without persisting changes',
    description:
      'Creates a dry-run execution against the supplied definition. Side-effecting nodes still fire by default; opt into mocking per-node with `mockOnDryRun: true`.',
  })
  @ApiAcceptedResponse({
    type: ExecutionResponseDto,
    description: 'Dry-run execution accepted and enqueued',
  })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async runTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TestExecutionDto,
    @Req() req: Request & { id?: string },
  ): Promise<ExecutionResponseDto> {
    return this.executions.triggerTest(user.id, id, {
      definition: dto.definition as unknown as WorkflowDefinition,
      triggerData: dto.triggerData,
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

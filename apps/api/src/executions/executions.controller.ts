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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { WorkflowDefinition } from '@tietide/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { OrgRolesGuard } from '../common/guards/org-roles.guard';
import {
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
  EXECUTE_THROTTLER_NAME,
} from '../common/throttler/throttler.config';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import type { OrgContext } from '../common/org-context/org-context.types';
import { ExecutionsService } from './executions.service';
import { TriggerExecutionDto } from './dto/trigger-execution.dto';
import { TestExecutionDto } from './dto/test-execution.dto';
import { ExecutionResponseDto } from './dto/execution-response.dto';
import { TriggerSampleResponseDto } from './dto/trigger-sample-response.dto';

// W5.8: env-tunable per-tenant execute cap. Buckets on the default (per-user)
// tracker; the guard substitutes the env-resolved limit/ttl so THROTTLE_EXECUTE_LIMIT /
// THROTTLE_EXECUTE_TTL_MS take effect at runtime. The values are the opt-in marker +
// compile-time fallback only.
const EXECUTE_THROTTLE = {
  [EXECUTE_THROTTLER_NAME]: {
    ttl: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
    limit: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  },
} as const;

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('workflows/:id')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post('execute')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
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
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TriggerExecutionDto,
    @Req() req: Request & { id?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ExecutionResponseDto> {
    return this.executions.triggerManual(org.id, user.id, id, {
      triggerData: dto.triggerData,
      idempotencyKey: idempotencyKey?.trim() || undefined,
      requestId: extractRequestId(req),
    });
  }

  @Post('test')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
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
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TestExecutionDto,
    @Req() req: Request & { id?: string },
  ): Promise<ExecutionResponseDto> {
    return this.executions.triggerTest(org.id, user.id, id, {
      definition: dto.definition as unknown as WorkflowDefinition,
      triggerData: dto.triggerData,
      requestId: extractRequestId(req),
    });
  }

  @Post('nodes/:nodeId/test')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @Throttle(EXECUTE_THROTTLE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Run a single node against real credentials and capture its output',
    description:
      'Builds a minimal subgraph (the node plus its ancestors) and runs it as a non-dry-run ' +
      'execution, so side-effecting connectors fire with live credentials. Used to capture an ' +
      'output sample for data-pill mapping.',
  })
  @ApiAcceptedResponse({
    type: ExecutionResponseDto,
    description: 'Node-test execution accepted and enqueued',
  })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Workflow or node not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async testNode(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: TestExecutionDto,
    @Req() req: Request & { id?: string },
  ): Promise<ExecutionResponseDto> {
    return this.executions.triggerNodeTest(org.id, user.id, id, nodeId, {
      definition: dto.definition as unknown as WorkflowDefinition,
      triggerData: dto.triggerData,
      requestId: extractRequestId(req),
    });
  }

  @Post('executions/:executionId/repeat')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @Throttle(EXECUTE_THROTTLE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Repeat a past execution with its original trigger data',
    description:
      "Creates a new run that replays the original execution's trigger data on the latest " +
      'workflow version, linked back to it via repeatOfExecutionId (Workato "Repeat job").',
  })
  @ApiAcceptedResponse({ type: ExecutionResponseDto, description: 'Repeat run accepted' })
  @ApiNotFoundResponse({ description: 'Workflow or execution not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async repeat(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('executionId', new ParseUUIDPipe({ version: '4' })) executionId: string,
    @Req() req: Request & { id?: string },
  ): Promise<ExecutionResponseDto> {
    return this.executions.repeatExecution(org.id, user.id, id, executionId, {
      requestId: extractRequestId(req),
    });
  }

  @Post('nodes/:nodeId/trigger-sample')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @Throttle(EXECUTE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fetch a candidate output sample for a trigger node',
    description:
      'A trigger has no live webhook to replay during editing, so this returns the most recent ' +
      'genuine run’s trigger payload ("Use data from last run") as a data-pill sample, or ' +
      '`source: "none"` when no prior run exists. Never persists — the editor adopts it after a diff.',
  })
  @ApiOkResponse({ type: TriggerSampleResponseDto })
  @ApiBadRequestResponse({ description: 'Node is not a trigger' })
  @ApiNotFoundResponse({ description: 'Workflow or node not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async triggerSample(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: TestExecutionDto,
  ): Promise<TriggerSampleResponseDto> {
    return this.executions.getTriggerSample(org.id, user.id, id, nodeId, {
      definition: dto.definition as unknown as WorkflowDefinition,
    });
  }
}

function extractRequestId(req: Request & { id?: string }): string | undefined {
  if (typeof req.id === 'string' && req.id.length > 0) return req.id;
  const header = req.headers?.['x-request-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  return undefined;
}

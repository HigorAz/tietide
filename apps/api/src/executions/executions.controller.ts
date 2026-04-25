import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ExecutionsService } from './executions.service';
import { TriggerExecutionDto } from './dto/trigger-execution.dto';
import { ExecutionResponseDto } from './dto/execution-response.dto';

@ApiTags('executions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('workflows/:id/execute')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Manually trigger a workflow execution' })
  @ApiAcceptedResponse({
    type: ExecutionResponseDto,
    description: 'Execution accepted and enqueued',
  })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Repeated requests with the same key return the same execution.',
  })
  async trigger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TriggerExecutionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ExecutionResponseDto> {
    return this.executions.triggerManual(user.id, id, {
      triggerData: dto.triggerData,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    });
  }
}

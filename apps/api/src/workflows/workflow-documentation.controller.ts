import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { WorkflowDocumentationService } from './workflow-documentation.service';
import { WorkflowDocumentationResponseDto } from './dto/workflow-documentation-response.dto';

@ApiTags('workflows')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('workflows/:id/generate-docs')
export class WorkflowDocumentationController {
  constructor(private readonly docs: WorkflowDocumentationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate (or fetch cached) AI documentation for a workflow',
    description:
      'Calls the FastAPI AI service to produce structured documentation via Ollama + RAG. ' +
      'The result is cached per workflow version — repeated calls without changes are served from cache.',
  })
  @ApiOkResponse({ type: WorkflowDocumentationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid workflow id' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiServiceUnavailableResponse({ description: 'AI service temporarily unavailable' })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WorkflowDocumentationResponseDto> {
    return this.docs.generate(user.id, id);
  }
}

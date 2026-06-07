import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
  DEFAULT_THROTTLER_NAME,
} from '../common/throttler/throttler.config';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { WorkflowDocumentationService } from './workflow-documentation.service';
import {
  DocumentationRegenerationAcceptedDto,
  WorkflowDocumentationResponseDto,
} from './dto/workflow-documentation-response.dto';

const AI_DOCS_THROTTLE = {
  [DEFAULT_THROTTLER_NAME]: {
    ttl: DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
    limit: DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  },
} as const;

@ApiTags('workflows')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('workflows/:id')
export class WorkflowDocumentationController {
  constructor(private readonly docs: WorkflowDocumentationService) {}

  @Get('documentation')
  @ApiOperation({
    summary: 'Get the cached AI documentation for a workflow',
    description:
      'Read-only, idempotent. Returns the latest persisted documentation row. ' +
      'Honors `If-None-Match` (ETag) and `If-Modified-Since` (Last-Modified) for 304 responses.',
  })
  @ApiOkResponse({ type: WorkflowDocumentationResponseDto })
  @ApiResponse({ status: 304, description: 'Documentation unchanged since the conditional bound' })
  @ApiBadRequestResponse({ description: 'Invalid workflow id' })
  @ApiNotFoundResponse({ description: 'Workflow or documentation not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async getDocumentation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('if-modified-since') ifModifiedSince: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkflowDocumentationResponseDto | undefined> {
    const existing = await this.docs.findExisting(user.id, id);
    if (!existing) {
      throw new NotFoundException('Documentation not found');
    }

    // HTTP-date is second-resolution; truncate updatedAt to seconds before
    // computing ETag and comparing with If-Modified-Since.
    const lastModifiedMs = Math.floor(existing.generatedAt.getTime() / 1000) * 1000;
    const etag = `"${existing.workflowId}-${lastModifiedMs}"`;
    const lastModified = new Date(lastModifiedMs).toUTCString();

    if (ifNoneMatch && this.matchesEtag(ifNoneMatch, etag)) {
      res.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }
    if (ifModifiedSince) {
      const since = Date.parse(ifModifiedSince);
      if (!Number.isNaN(since) && since >= lastModifiedMs) {
        res.status(HttpStatus.NOT_MODIFIED);
        return undefined;
      }
    }

    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', lastModified);
    return existing;
  }

  @Post('documentation/regenerate')
  @Throttle(AI_DOCS_THROTTLE)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start regenerating AI documentation for a workflow',
    description:
      'Kicks off documentation generation (FastAPI AI service via Ollama + RAG) in the background ' +
      'and returns 202 immediately. Generation can take minutes on a CPU-only model, longer than ' +
      'edge proxy timeouts, so the client polls GET /documentation until the row is updated.',
  })
  @ApiAcceptedResponse({ type: DocumentationRegenerationAcceptedDto })
  @ApiBadRequestResponse({ description: 'Invalid workflow id' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DocumentationRegenerationAcceptedDto> {
    return this.docs.startRegeneration(user.id, id);
  }

  private matchesEtag(ifNoneMatch: string, etag: string): boolean {
    const trimmed = ifNoneMatch.trim();
    if (trimmed === '*') return true;
    return trimmed
      .split(',')
      .map((token) => token.trim())
      .some((token) => token === etag || token === `W/${etag}`);
  }
}

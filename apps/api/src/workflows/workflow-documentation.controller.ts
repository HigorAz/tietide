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
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import {
  AI_THROTTLER_NAME,
  DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
} from '../common/throttler/throttler.config';
import type { OrgContext } from '../common/org-context/org-context.types';
import { WorkflowDocumentationService } from './workflow-documentation.service';
import {
  DocumentationRegenerationAcceptedDto,
  WorkflowDocumentationResponseDto,
} from './dto/workflow-documentation-response.dto';

// W5.8: env-tunable AI-doc-generation cap. Buckets on the default (per-user) tracker;
// the guard substitutes the env-resolved limit/ttl so THROTTLE_AI_LIMIT /
// THROTTLE_AI_TTL_MS take effect at runtime. The values are the opt-in marker +
// compile-time fallback only.
const AI_DOCS_THROTTLE = {
  [AI_THROTTLER_NAME]: {
    ttl: DEFAULT_AI_GENERATE_THROTTLE_TTL_MS,
    limit: DEFAULT_AI_GENERATE_THROTTLE_LIMIT,
  },
} as const;

@ApiTags('workflows')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard)
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
    @CurrentOrg() org: OrgContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('if-modified-since') ifModifiedSince: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkflowDocumentationResponseDto | undefined> {
    const existing = await this.docs.findExisting(org.id, id);
    if (!existing) {
      throw new NotFoundException('Documentation not found');
    }

    // Force revalidation on every request. Without this, browsers heuristically
    // cache the response (~10% of its age via Last-Modified), so polling after a
    // regenerate keeps reading the STALE doc from cache and never sees the new
    // one — the SPA then times out. `no-cache` keeps the ETag/304 fast-path while
    // guaranteeing the client always checks for a fresher doc.
    res.setHeader('Cache-Control', 'private, no-cache');

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
    @CurrentOrg() org: OrgContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DocumentationRegenerationAcceptedDto> {
    return this.docs.startRegeneration(org.id, id);
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

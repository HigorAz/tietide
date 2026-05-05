import {
  Controller,
  Get,
  Header,
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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { WorkflowDocumentationService } from './workflow-documentation.service';
import {
  LegacyWorkflowDocumentationResponseDto,
  WorkflowDocumentationResponseDto,
} from './dto/workflow-documentation-response.dto';

// Sunset date for the deprecated POST /workflows/:id/generate-docs alias.
// Per CLAUDE.md §11, deprecated endpoints stay for at least one release.
const LEGACY_SUNSET_HTTP_DATE = new Date('2026-07-04T00:00:00Z').toUTCString();

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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate AI documentation for a workflow',
    description:
      'Always calls the FastAPI AI service to produce structured documentation via Ollama + RAG, ' +
      'upserts the persisted row, and returns the freshly generated body.',
  })
  @ApiOkResponse({ type: WorkflowDocumentationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid workflow id' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiServiceUnavailableResponse({ description: 'AI service temporarily unavailable' })
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WorkflowDocumentationResponseDto> {
    return this.docs.regenerate(user.id, id);
  }

  @Post('generate-docs')
  @HttpCode(HttpStatus.OK)
  @Header('Deprecation', 'true')
  @Header('Sunset', LEGACY_SUNSET_HTTP_DATE)
  @ApiOperation({
    deprecated: true,
    summary: 'DEPRECATED — use GET /documentation or POST /documentation/regenerate',
    description:
      'Kept for one release for backwards compatibility. New clients should use ' +
      'GET /workflows/:id/documentation for reads and POST /workflows/:id/documentation/regenerate ' +
      'for explicit regeneration.',
  })
  @ApiOkResponse({ type: LegacyWorkflowDocumentationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid workflow id' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  @ApiServiceUnavailableResponse({ description: 'AI service temporarily unavailable' })
  async generateLegacy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<LegacyWorkflowDocumentationResponseDto> {
    return this.docs.generateLegacy(user.id, id);
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

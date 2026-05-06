import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { WorkflowVersionsService } from './workflow-versions.service';
import {
  WorkflowVersionListResponseDto,
  WorkflowVersionResponseDto,
  WorkflowVersionRestoreResponseDto,
} from './dto/version-response.dto';

@ApiTags('workflow-versions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('workflows/:id/versions')
export class WorkflowVersionsController {
  constructor(private readonly versions: WorkflowVersionsService) {}

  @Get()
  @ApiOperation({ summary: 'List versions of a workflow (most recent first)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '1..100, default 20' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: WorkflowVersionListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid limit or cursor' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<WorkflowVersionListResponseDto> {
    const parsedLimit = limit !== undefined ? Number.parseInt(limit, 10) : undefined;
    return this.versions.list(user.id, id, { cursor, limit: parsedLimit });
  }

  @Get(':version')
  @ApiOperation({ summary: 'Fetch a specific workflow version by version number' })
  @ApiOkResponse({ type: WorkflowVersionResponseDto })
  @ApiNotFoundResponse({ description: 'Workflow or version not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<WorkflowVersionResponseDto> {
    return this.versions.getOne(user.id, id, version);
  }

  @Post(':version/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Return the definition of a prior version for the editor to load',
    description:
      'Read-only on the API side. Returns { version, definition } and audit-logs the restore intent. ' +
      'Does NOT mutate the live workflow — the editor must Save (PATCH) to commit.',
  })
  @ApiOkResponse({ type: WorkflowVersionRestoreResponseDto })
  @ApiNotFoundResponse({ description: 'Workflow or version not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<WorkflowVersionRestoreResponseDto> {
    return this.versions.restore(user.id, id, version);
  }
}

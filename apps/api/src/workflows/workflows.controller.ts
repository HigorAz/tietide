import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { OrgRolesGuard } from '../common/guards/org-roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import type { OrgContext } from '../common/org-context/org-context.types';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowResponseDto } from './dto/workflow-response.dto';
import { PaginatedWorkflowsDto } from './dto/workflow-list-response.dto';

@ApiTags('workflows')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @ApiOperation({ summary: "List the active workspace's workflows (cursor-paginated)" })
  @ApiOkResponse({ type: PaginatedWorkflowsDto })
  @ApiQuery({
    name: 'folderId',
    required: false,
    description: 'UUID of a folder, the literal string "null" for root, or omitted for no filter.',
  })
  @ApiQuery({
    name: 'tagIds',
    required: false,
    description: 'Comma-separated UUIDs. Returns workflows tagged with ANY of the given tags.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max items per page (default 50, max 100).',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: "Opaque cursor from a previous page's nextCursor.",
  })
  async list(
    @CurrentOrg() org: OrgContext,
    @Query('folderId') folderId?: string,
    @Query('tagIds') tagIds?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedWorkflowsDto> {
    const filter: { folderId?: string | null; tagIds?: string[]; limit?: number; cursor?: string } =
      {};
    if (limit !== undefined) {
      const parsed = Number(limit);
      filter.limit = Number.isFinite(parsed) ? parsed : undefined;
    }
    if (cursor !== undefined && cursor.length > 0) {
      filter.cursor = cursor;
    }
    if (folderId !== undefined) {
      if (folderId === 'null') {
        filter.folderId = null;
      } else if (
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
          folderId,
        )
      ) {
        filter.folderId = folderId;
      } else {
        throw new BadRequestException('folderId must be a UUID v4 or "null"');
      }
    }
    if (tagIds !== undefined && tagIds.length > 0) {
      const ids = tagIds
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const uuid =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (!ids.every((id) => uuid.test(id))) {
        throw new BadRequestException('tagIds must be a comma-separated list of UUID v4');
      }
      filter.tagIds = ids;
    }
    return this.workflows.list(org.id, filter);
  }

  @Post()
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiCreatedResponse({ type: WorkflowResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ): Promise<WorkflowResponseDto> {
    return this.workflows.create(org.id, user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single workflow by id' })
  @ApiOkResponse({ type: WorkflowResponseDto })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async findOne(
    @CurrentOrg() org: OrgContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WorkflowResponseDto> {
    return this.workflows.findOne(org.id, id);
  }

  @Patch(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Update a workflow (auto-increments version)' })
  @ApiOkResponse({ type: WorkflowResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateWorkflowDto,
  ): Promise<WorkflowResponseDto> {
    return this.workflows.update(org.id, user.id, id, dto);
  }

  @Delete(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workflow' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.workflows.remove(org.id, user.id, id);
  }
}

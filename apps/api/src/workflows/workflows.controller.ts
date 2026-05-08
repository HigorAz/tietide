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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowResponseDto } from './dto/workflow-response.dto';

@ApiTags('workflows')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated user's workflows" })
  @ApiOkResponse({ type: WorkflowResponseDto, isArray: true })
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
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('folderId') folderId?: string,
    @Query('tagIds') tagIds?: string,
  ): Promise<WorkflowResponseDto[]> {
    const filter: { folderId?: string | null; tagIds?: string[] } = {};
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
    return this.workflows.list(user.id, filter);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiCreatedResponse({ type: WorkflowResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ): Promise<WorkflowResponseDto> {
    return this.workflows.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single workflow by id' })
  @ApiOkResponse({ type: WorkflowResponseDto })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WorkflowResponseDto> {
    return this.workflows.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workflow (auto-increments version)' })
  @ApiOkResponse({ type: WorkflowResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateWorkflowDto,
  ): Promise<WorkflowResponseDto> {
    return this.workflows.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workflow' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Workflow not found' })
  @ApiForbiddenResponse({ description: 'You do not have access to this workflow' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.workflows.remove(user.id, id);
  }
}

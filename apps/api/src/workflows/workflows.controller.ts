import {
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
  async list(@CurrentUser() user: AuthenticatedUser): Promise<WorkflowResponseDto[]> {
    return this.workflows.list(user.id);
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

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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
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
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagResponseDto } from './dto/tag-response.dto';
import { PaginatedTagsDto } from './dto/tag-list-response.dto';
import { PageQueryDto } from '../common/pagination/page-query.dto';

@ApiTags('tags')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({ summary: "List the active workspace's tags (cursor-paginated)" })
  @ApiOkResponse({ type: PaginatedTagsDto })
  async list(
    @CurrentOrg() org: OrgContext,
    @Query() page: PageQueryDto,
  ): Promise<PaginatedTagsDto> {
    return this.tags.list(org.id, page);
  }

  @Post()
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiCreatedResponse({ type: TagResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: 'Tag with this name already exists' })
  async create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTagDto,
  ): Promise<TagResponseDto> {
    return this.tags.create(org.id, user.id, dto);
  }

  @Patch(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Rename a tag and/or update its color' })
  @ApiOkResponse({ type: TagResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  @ApiConflictResponse({ description: 'Tag with this name already exists' })
  async update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<TagResponseDto> {
    if (dto.name === undefined && dto.color === undefined) {
      throw new BadRequestException('Provide at least one of: name, color');
    }
    return this.tags.update(org.id, user.id, id, dto);
  }

  @Delete(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag (workflow associations cascade)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.tags.remove(org.id, user.id, id);
  }
}

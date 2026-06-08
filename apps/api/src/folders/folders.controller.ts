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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { DeleteFolderResultDto, FolderResponseDto } from './dto/folder-response.dto';
import { PaginatedFoldersDto } from './dto/folder-list-response.dto';
import { PageQueryDto } from '../common/pagination/page-query.dto';

@ApiTags('folders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  @ApiOperation({ summary: "List the active workspace's folders (flat, cursor-paginated)" })
  @ApiOkResponse({ type: PaginatedFoldersDto })
  async list(
    @CurrentOrg() org: OrgContext,
    @Query() page: PageQueryDto,
  ): Promise<PaginatedFoldersDto> {
    return this.folders.list(org.id, page);
  }

  @Post()
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a folder (optionally nested under another)' })
  @ApiCreatedResponse({ type: FolderResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Parent folder not found' })
  async create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFolderDto,
  ): Promise<FolderResponseDto> {
    return this.folders.create(org.id, user.id, dto);
  }

  @Patch(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Rename a folder and/or move it under another parent' })
  @ApiOkResponse({ type: FolderResponseDto })
  @ApiBadRequestResponse({ description: 'Cycle or invalid input' })
  @ApiNotFoundResponse({ description: 'Folder not found' })
  async update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<FolderResponseDto> {
    return this.folders.update(org.id, user.id, id, dto);
  }

  @Delete(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @ApiOperation({
    summary: 'Cascade-delete a folder, all sub-folders, and any contained workflows',
  })
  @ApiOkResponse({ type: DeleteFolderResultDto })
  @ApiNotFoundResponse({ description: 'Folder not found' })
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DeleteFolderResultDto> {
    return this.folders.remove(org.id, user.id, id);
  }
}

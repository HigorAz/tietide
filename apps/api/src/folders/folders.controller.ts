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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { DeleteFolderResultDto, FolderResponseDto } from './dto/folder-response.dto';

@ApiTags('folders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated user's folders (flat)" })
  @ApiOkResponse({ type: FolderResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<FolderResponseDto[]> {
    return this.folders.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a folder (optionally nested under another)' })
  @ApiCreatedResponse({ type: FolderResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Parent folder not found' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFolderDto,
  ): Promise<FolderResponseDto> {
    return this.folders.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a folder and/or move it under another parent' })
  @ApiOkResponse({ type: FolderResponseDto })
  @ApiBadRequestResponse({ description: 'Cycle or invalid input' })
  @ApiNotFoundResponse({ description: 'Folder not found' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<FolderResponseDto> {
    return this.folders.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Cascade-delete a folder, all sub-folders, and any contained workflows',
  })
  @ApiOkResponse({ type: DeleteFolderResultDto })
  @ApiNotFoundResponse({ description: 'Folder not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DeleteFolderResultDto> {
    return this.folders.remove(user.id, id);
  }
}

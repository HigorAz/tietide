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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { EnvVarsService } from './env-vars.service';
import { CreateEnvVarDto } from './dto/create-env-var.dto';
import { UpdateEnvVarDto } from './dto/update-env-var.dto';
import { EnvVarResponseDto } from './dto/env-var-response.dto';
import { PaginatedEnvVarsDto } from './dto/env-var-list-response.dto';
import { PageQueryDto } from '../common/pagination/page-query.dto';

@ApiTags('admin-env-vars')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not an ADMIN' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/env-vars')
export class AdminEnvVarsController {
  constructor(private readonly envVars: EnvVarsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all GLOBAL-scope env vars (values masked, admin only, cursor-paginated)',
  })
  @ApiOkResponse({ type: PaginatedEnvVarsDto })
  async list(@Query() page: PageQueryDto): Promise<PaginatedEnvVarsDto> {
    return this.envVars.list({
      scope: 'GLOBAL',
      ownerUserId: null,
      limit: page.limit,
      cursor: page.cursor,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a GLOBAL-scope env var (admin only)' })
  @ApiCreatedResponse({ type: EnvVarResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: 'Env var with this key already exists in GLOBAL scope' })
  async create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateEnvVarDto,
  ): Promise<EnvVarResponseDto> {
    return this.envVars.create({
      scope: 'GLOBAL',
      ownerUserId: null,
      actorUserId: admin.id,
      dto,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a GLOBAL-scope env var and/or rotate its value (admin only)' })
  @ApiOkResponse({ type: EnvVarResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Env var not found' })
  @ApiConflictResponse({ description: 'Env var with this key already exists in scope' })
  async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateEnvVarDto,
  ): Promise<EnvVarResponseDto> {
    if (dto.key === undefined && dto.value === undefined) {
      throw new BadRequestException('Provide at least one of: key, value');
    }
    return this.envVars.update({
      scope: 'GLOBAL',
      ownerUserId: null,
      actorUserId: admin.id,
      id,
      dto,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a GLOBAL-scope env var (admin only)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Env var not found' })
  async remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.envVars.remove({
      scope: 'GLOBAL',
      ownerUserId: null,
      actorUserId: admin.id,
      id,
    });
  }
}

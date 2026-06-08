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
import { EnvVarsService } from './env-vars.service';
import { CreateEnvVarDto } from './dto/create-env-var.dto';
import { UpdateEnvVarDto } from './dto/update-env-var.dto';
import { EnvVarResponseDto } from './dto/env-var-response.dto';
import { PaginatedEnvVarsDto } from './dto/env-var-list-response.dto';
import { PageQueryDto } from '../common/pagination/page-query.dto';

@ApiTags('env-vars')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('env-vars')
export class EnvVarsController {
  constructor(private readonly envVars: EnvVarsService) {}

  @Get()
  @ApiOperation({
    summary: "List the active workspace's USER-scope env vars (values masked, cursor-paginated)",
  })
  @ApiOkResponse({ type: PaginatedEnvVarsDto })
  async list(
    @CurrentOrg() org: OrgContext,
    @Query() page: PageQueryDto,
  ): Promise<PaginatedEnvVarsDto> {
    return this.envVars.list({
      scope: 'USER',
      organizationId: org.id,
      limit: page.limit,
      cursor: page.cursor,
    });
  }

  @Post()
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a USER-scope env var (value encrypted at rest)' })
  @ApiCreatedResponse({ type: EnvVarResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: 'Env var with this key already exists in USER scope' })
  async create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEnvVarDto,
  ): Promise<EnvVarResponseDto> {
    return this.envVars.create({
      scope: 'USER',
      organizationId: org.id,
      actorUserId: user.id,
      dto,
    });
  }

  @Patch(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Rename a USER-scope env var and/or rotate its encrypted value' })
  @ApiOkResponse({ type: EnvVarResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Env var not found' })
  @ApiConflictResponse({ description: 'Env var with this key already exists in scope' })
  async update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateEnvVarDto,
  ): Promise<EnvVarResponseDto> {
    if (dto.key === undefined && dto.value === undefined) {
      throw new BadRequestException('Provide at least one of: key, value');
    }
    return this.envVars.update({
      scope: 'USER',
      organizationId: org.id,
      actorUserId: user.id,
      id,
      dto,
    });
  }

  @Delete(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a USER-scope env var' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Env var not found' })
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.envVars.remove({
      scope: 'USER',
      organizationId: org.id,
      actorUserId: user.id,
      id,
    });
  }
}

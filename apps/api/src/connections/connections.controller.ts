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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConnectionType, PROVIDER_CONFIG_SCHEMAS, type ProviderConfigMap } from '@tietide/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import {
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
  EXECUTE_THROTTLER_NAME,
} from '../common/throttler/throttler.config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { OrgRolesGuard } from '../common/guards/org-roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import type { OrgContext } from '../common/org-context/org-context.types';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { TestConnectionResponseDto } from './dto/test-connection-response.dto';
import { PaginatedConnectionsDto } from './dto/connection-list-response.dto';
import { PageQueryDto } from '../common/pagination/page-query.dto';

// W5.37: POST :id/test fires an outbound provider HTTP probe (a credential
// health check), so a cheap inbound request amplifies into a heavier outbound
// one. Opt into the execute-tier cap (~20/min, env-tunable) — the same budget
// as workflow execute/test — instead of leaning on the 100/min global default.
// The guard substitutes the env-resolved limit/ttl at runtime; these values are
// the opt-in marker + compile-time fallback only.
const EXECUTE_THROTTLE = {
  [EXECUTE_THROTTLER_NAME]: {
    ttl: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_TTL_MS,
    limit: DEFAULT_WORKFLOW_EXECUTE_THROTTLE_LIMIT,
  },
} as const;

@ApiTags('connections')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @ApiOperation({
    summary: "List the active workspace's connections (config masked, cursor-paginated)",
  })
  @ApiOkResponse({ type: PaginatedConnectionsDto })
  async list(
    @CurrentOrg() org: OrgContext,
    @Query() page: PageQueryDto,
  ): Promise<PaginatedConnectionsDto> {
    return this.connections.list(org.id, page);
  }

  @Post()
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @ApiOperation({
    summary: 'Create an API-key connection (OAuth connections use /connections/oauth/start)',
  })
  @ApiCreatedResponse({ type: ConnectionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input or unsupported type/provider' })
  async create(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    if (dto.type === ConnectionType.OAUTH2) {
      throw new BadRequestException(
        'OAuth connections must be created via /connections/oauth/start.',
      );
    }
    const schema = PROVIDER_CONFIG_SCHEMAS[dto.provider as keyof ProviderConfigMap];
    if (!schema) {
      throw new BadRequestException(`Unknown provider "${dto.provider}"`);
    }
    const result = schema.safeParse(dto.config);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid config for provider "${dto.provider}": ${issues}`);
    }
    return this.connections.create(org.id, user.id, {
      type: dto.type,
      provider: dto.provider,
      name: dto.name,
      config: result.data as Record<string, unknown>,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a connection (config masked)' })
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  async findOne(
    @CurrentOrg() org: OrgContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ConnectionResponseDto> {
    return this.connections.findOne(org.id, id);
  }

  @Patch(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Update a connection name and/or status' })
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  async update(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    if (dto.name === undefined && dto.status === undefined) {
      throw new BadRequestException('Provide at least one of: name, status');
    }
    return this.connections.update(org.id, user.id, id, dto);
  }

  @Post(':id/test')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @Throttle(EXECUTE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run a provider-specific health check against the stored credentials',
  })
  @ApiOkResponse({ type: TestConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  async test(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TestConnectionResponseDto> {
    return this.connections.test(org.id, user.id, id);
  }

  @Delete(':id')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke (delete) a connection' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  async remove(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.connections.remove(org.id, user.id, id);
  }
}

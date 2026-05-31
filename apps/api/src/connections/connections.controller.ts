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
import { ConnectionType, PROVIDER_CONFIG_SCHEMAS, type ProviderConfigMap } from '@tietide/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { TestConnectionResponseDto } from './dto/test-connection-response.dto';
import { PaginatedConnectionsDto } from './dto/connection-list-response.dto';
import { PageQueryDto } from '../common/pagination/page-query.dto';

@ApiTags('connections')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @ApiOperation({
    summary: "List the authenticated user's connections (config masked, cursor-paginated)",
  })
  @ApiOkResponse({ type: PaginatedConnectionsDto })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() page: PageQueryDto,
  ): Promise<PaginatedConnectionsDto> {
    return this.connections.list(user.id, page);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an API-key connection (OAuth connections use /connections/oauth/start)',
  })
  @ApiCreatedResponse({ type: ConnectionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input or unsupported type/provider' })
  async create(
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
    return this.connections.create(user.id, {
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ConnectionResponseDto> {
    return this.connections.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a connection name and/or status' })
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    if (dto.name === undefined && dto.status === undefined) {
      throw new BadRequestException('Provide at least one of: name, status');
    }
    return this.connections.update(user.id, id, dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run a provider-specific health check against the stored credentials',
  })
  @ApiOkResponse({ type: TestConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  async test(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TestConnectionResponseDto> {
    return this.connections.test(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke (delete) a connection' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.connections.remove(user.id, id);
  }
}

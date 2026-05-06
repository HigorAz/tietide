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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { ConnectionsService } from './connections.service';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';

@ApiTags('connections')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated user's connections (config masked)" })
  @ApiOkResponse({ type: ConnectionResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ConnectionResponseDto[]> {
    return this.connections.list(user.id);
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

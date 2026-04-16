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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { SecretsService } from './secrets.service';
import { CreateSecretDto } from './dto/create-secret.dto';
import { UpdateSecretDto } from './dto/update-secret.dto';
import { SecretResponseDto } from './dto/secret-response.dto';

@ApiTags('secrets')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('secrets')
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated user's secrets (values masked)" })
  @ApiOkResponse({ type: SecretResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<SecretResponseDto[]> {
    return this.secrets.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new encrypted secret' })
  @ApiCreatedResponse({ type: SecretResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: 'Secret with this name already exists' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSecretDto,
  ): Promise<SecretResponseDto> {
    return this.secrets.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a secret and/or rotate its encrypted value' })
  @ApiOkResponse({ type: SecretResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Secret not found' })
  @ApiConflictResponse({ description: 'Secret with this name already exists' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateSecretDto,
  ): Promise<SecretResponseDto> {
    if (dto.name === undefined && dto.value === undefined) {
      throw new BadRequestException('Provide at least one of: name, value');
    }
    return this.secrets.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a secret' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Secret not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.secrets.remove(user.id, id);
  }
}

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
import { EnvVarsService } from './env-vars.service';
import { CreateEnvVarDto } from './dto/create-env-var.dto';
import { UpdateEnvVarDto } from './dto/update-env-var.dto';
import { EnvVarResponseDto } from './dto/env-var-response.dto';

@ApiTags('env-vars')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('env-vars')
export class EnvVarsController {
  constructor(private readonly envVars: EnvVarsService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated user's USER-scope env vars (values masked)" })
  @ApiOkResponse({ type: EnvVarResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<EnvVarResponseDto[]> {
    return this.envVars.list({ scope: 'USER', ownerUserId: user.id });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a USER-scope env var (value encrypted at rest)' })
  @ApiCreatedResponse({ type: EnvVarResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: 'Env var with this key already exists in USER scope' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEnvVarDto,
  ): Promise<EnvVarResponseDto> {
    return this.envVars.create({
      scope: 'USER',
      ownerUserId: user.id,
      actorUserId: user.id,
      dto,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a USER-scope env var and/or rotate its encrypted value' })
  @ApiOkResponse({ type: EnvVarResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Env var not found' })
  @ApiConflictResponse({ description: 'Env var with this key already exists in scope' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateEnvVarDto,
  ): Promise<EnvVarResponseDto> {
    if (dto.key === undefined && dto.value === undefined) {
      throw new BadRequestException('Provide at least one of: key, value');
    }
    return this.envVars.update({
      scope: 'USER',
      ownerUserId: user.id,
      actorUserId: user.id,
      id,
      dto,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a USER-scope env var' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Env var not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.envVars.remove({
      scope: 'USER',
      ownerUserId: user.id,
      actorUserId: user.id,
      id,
    });
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { OrganizationInvitesService } from './organization-invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { OrgInviteResponseDto } from './dto/org-invite-response.dto';

// Role enforcement is in the service against the path :id org (SUPERADMIN/ADMIN).
@ApiTags('organizations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('organizations/:id/invites')
export class OrganizationInvitesController {
  constructor(private readonly invites: OrganizationInvitesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite someone by email (SUPERADMIN/ADMIN; not above your rank)' })
  @ApiCreatedResponse({ type: OrgInviteResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiForbiddenResponse({ description: 'Insufficient organization role' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) orgId: string,
    @Body() dto: CreateInviteDto,
  ): Promise<OrgInviteResponseDto> {
    return this.invites.create(orgId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List pending invitations (SUPERADMIN/ADMIN)' })
  @ApiOkResponse({ type: OrgInviteResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Insufficient organization role' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) orgId: string,
  ): Promise<OrgInviteResponseDto[]> {
    return this.invites.list(orgId, user.id);
  }

  @Delete(':inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a pending invitation (SUPERADMIN/ADMIN)' })
  @ApiNoContentResponse({ description: 'Revoked' })
  @ApiForbiddenResponse({ description: 'Insufficient organization role' })
  @ApiNotFoundResponse({ description: 'Organization or invite not found' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) orgId: string,
    @Param('inviteId', new ParseUUIDPipe({ version: '4' })) inviteId: string,
  ): Promise<void> {
    await this.invites.revoke(orgId, user.id, inviteId);
  }
}

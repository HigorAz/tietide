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
import { OrganizationsService } from './organizations.service';
import { OrganizationInvitesService } from './organization-invites.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationSummaryDto } from './dto/organization-summary.dto';

// Workspace management routes operate on a specific org by path :id (which may
// differ from the active X-Org-Id), so membership/role is enforced in the service
// against that path org — not via OrgContextGuard (which is header-scoped).
@ApiTags('organizations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly invites: OrganizationInvitesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a workspace; the caller becomes its SUPERADMIN' })
  @ApiCreatedResponse({ type: OrganizationSummaryDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationSummaryDto> {
    return this.organizations.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the workspaces the caller belongs to (with their role)' })
  @ApiOkResponse({ type: OrganizationSummaryDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<OrganizationSummaryDto[]> {
    return this.organizations.listForUser(user.id);
  }

  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an emailed workspace invitation' })
  @ApiOkResponse({ type: OrganizationSummaryDto })
  @ApiBadRequestResponse({ description: 'Invalid or expired invitation' })
  async acceptInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptInviteDto,
  ): Promise<OrganizationSummaryDto> {
    return this.invites.accept(user.id, user.email, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a workspace the caller is a member of' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<OrganizationResponseDto> {
    return this.organizations.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a workspace (SUPERADMIN only)' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiForbiddenResponse({ description: 'Insufficient organization role' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    return this.organizations.rename(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workspace (SUPERADMIN only; not your only one)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiBadRequestResponse({ description: 'Cannot delete your only workspace' })
  @ApiForbiddenResponse({ description: 'Insufficient organization role' })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.organizations.remove(id, user.id);
  }
}

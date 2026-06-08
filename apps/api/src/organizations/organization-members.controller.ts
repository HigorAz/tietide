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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { OrgMemberResponseDto } from './dto/org-member-response.dto';

// Role enforcement is in the service against the path :id org (see OrganizationsController).
@ApiTags('organizations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('organizations/:id/members')
export class OrganizationMembersController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List workspace members (any member)' })
  @ApiOkResponse({ type: OrgMemberResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) orgId: string,
  ): Promise<OrgMemberResponseDto[]> {
    return this.organizations.listMembers(orgId, user.id);
  }

  @Patch(':userId')
  @ApiOperation({ summary: "Change a member's role (SUPERADMIN/ADMIN, within rank rules)" })
  @ApiOkResponse({ type: OrgMemberResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid input or last-SUPERADMIN invariant' })
  @ApiForbiddenResponse({ description: 'Insufficient organization role' })
  @ApiNotFoundResponse({ description: 'Organization or member not found' })
  async changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) orgId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<OrgMemberResponseDto> {
    return this.organizations.changeMemberRole(orgId, user.id, targetUserId, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member (SUPERADMIN/ADMIN, within rank rules)' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiBadRequestResponse({ description: 'Last-SUPERADMIN invariant' })
  @ApiForbiddenResponse({ description: 'Insufficient organization role' })
  @ApiNotFoundResponse({ description: 'Organization or member not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) orgId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
  ): Promise<void> {
    await this.organizations.removeMember(orgId, user.id, targetUserId);
  }
}

import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { WorkflowResponseDto } from '../workflows/dto/workflow-response.dto';
import { LibraryService } from './library.service';
import { TemplateResponseDto } from './dto/template-response.dto';

@ApiTags('library')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('library/templates')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @ApiOperation({ summary: 'List the workflow templates available for one-click instantiation' })
  @ApiOkResponse({ type: TemplateResponseDto, isArray: true })
  list(): TemplateResponseDto[] {
    return this.library.list();
  }

  @Post(':slug/instantiate')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a copy of the template in the active workspace and return the new workflow',
  })
  @ApiCreatedResponse({ type: WorkflowResponseDto })
  @ApiNotFoundResponse({ description: 'Template not found' })
  async instantiate(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<WorkflowResponseDto> {
    return this.library.instantiate(org.id, user.id, slug);
  }
}

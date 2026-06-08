import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { DemoService } from './demo.service';
import { DemoSeedResponseDto } from './dto/demo-seed-response.dto';

@ApiTags('demo')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('seed')
  @OrgRoles('SUPERADMIN', 'ADMIN', 'MEMBER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed presentation-day demo workflows into the active workspace (idempotent)',
  })
  @ApiOkResponse({ type: DemoSeedResponseDto })
  async seed(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DemoSeedResponseDto> {
    return this.demo.seedForOrg(org.id, user.id);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UsageService } from './usage.service';
import { UsageRange, UsageSummaryQueryDto } from './dto/usage-summary-query.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary-response.dto';

@ApiTags('usage')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Per-user usage analytics over a rolling 7/30/90-day window' })
  @ApiOkResponse({ type: UsageSummaryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UsageSummaryQueryDto,
  ): Promise<UsageSummaryResponseDto> {
    return this.usage.getSummary(user.id, query.range ?? UsageRange.D7);
  }
}

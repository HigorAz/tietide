import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import type { OrgContext } from '../common/org-context/org-context.types';
import { UsageService } from './usage.service';
import { UsageRange, UsageSummaryQueryDto } from './dto/usage-summary-query.dto';
import { UsageSummaryResponseDto } from './dto/usage-summary-response.dto';

@ApiTags('usage')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard)
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Active-workspace usage analytics over a rolling 7/30/90-day window' })
  @ApiOkResponse({ type: UsageSummaryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  async getSummary(
    @CurrentOrg() org: OrgContext,
    @Query() query: UsageSummaryQueryDto,
  ): Promise<UsageSummaryResponseDto> {
    return this.usage.getSummary(org.id, query.range ?? UsageRange.D7);
  }
}

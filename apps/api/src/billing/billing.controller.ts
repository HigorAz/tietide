import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { OrgRolesGuard } from '../common/guards/org-roles.guard';
import type { OrgContext } from '../common/org-context/org-context.types';
import { BillingService, type BillingOverviewDto } from './billing.service';
import { StartCheckoutDto } from './dto/start-checkout.dto';

@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard, OrgContextGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'Plan, status and usage for the active workspace' })
  async getBilling(@CurrentOrg() org: OrgContext): Promise<BillingOverviewDto> {
    return this.billing.getBilling(org.id);
  }

  @Post('checkout')
  @UseGuards(OrgRolesGuard)
  @OrgRoles('SUPERADMIN')
  @ApiOperation({ summary: 'Start a Stripe Checkout session to subscribe to a paid plan' })
  @ApiOkResponse({ description: 'Stripe Checkout URL' })
  @ApiForbiddenResponse({ description: 'Only a workspace SUPERADMIN can manage billing' })
  async checkout(
    @CurrentOrg() org: OrgContext,
    @Body() dto: StartCheckoutDto,
  ): Promise<{ url: string }> {
    return this.billing.startCheckout(org.id, dto.plan);
  }

  @Post('portal')
  @UseGuards(OrgRolesGuard)
  @OrgRoles('SUPERADMIN')
  @ApiOperation({ summary: 'Open the Stripe billing portal for the workspace' })
  @ApiOkResponse({ description: 'Stripe billing portal URL' })
  @ApiForbiddenResponse({ description: 'Only a workspace SUPERADMIN can manage billing' })
  async portal(@CurrentOrg() org: OrgContext): Promise<{ url: string }> {
    return this.billing.openPortal(org.id);
  }
}

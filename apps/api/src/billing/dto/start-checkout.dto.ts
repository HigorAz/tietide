import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PlanTier } from '@tietide/shared';

/** Paid plans the caller may subscribe to via Checkout (FREE is not purchasable). */
const PURCHASABLE_PLANS: PlanTier[] = [PlanTier.PRO, PlanTier.BUSINESS];

export class StartCheckoutDto {
  @ApiProperty({ enum: PURCHASABLE_PLANS, description: 'Paid plan to subscribe the workspace to' })
  @IsIn(PURCHASABLE_PLANS)
  plan!: PlanTier;
}

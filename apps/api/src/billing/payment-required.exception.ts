import { HttpException, HttpStatus } from '@nestjs/common';

/** Which plan limit was hit — the SPA maps this to a targeted upgrade prompt. */
export type PlanLimitReason = 'workspaces' | 'seats' | 'runs' | 'workflows';

/**
 * HTTP 402 Payment Required — raised when an action exceeds the workspace's plan
 * limits. Carries a machine-readable `reason` (preserved by GlobalExceptionFilter)
 * so the client can show "upgrade to add seats / create more workspaces / keep
 * running" rather than a generic error.
 */
export class PaymentRequiredException extends HttpException {
  constructor(reason: PlanLimitReason, message: string) {
    super(
      { statusCode: HttpStatus.PAYMENT_REQUIRED, reason, message },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

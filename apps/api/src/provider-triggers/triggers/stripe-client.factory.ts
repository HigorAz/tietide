import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeClientFactory {
  forApiKey(apiKey: string): Stripe {
    return new Stripe(apiKey, { apiVersion: '2025-02-24.acacia' });
  }
}

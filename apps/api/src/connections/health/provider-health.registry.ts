import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProviderHealthChecker } from './provider-health.types';

@Injectable()
export class ProviderHealthRegistry {
  private readonly checkers = new Map<string, ProviderHealthChecker>();

  register(checker: ProviderHealthChecker): void {
    this.checkers.set(checker.provider, checker);
  }

  get(provider: string): ProviderHealthChecker {
    const checker = this.checkers.get(provider);
    if (!checker) {
      throw new NotFoundException(`No health checker registered for provider "${provider}"`);
    }
    return checker;
  }

  has(provider: string): boolean {
    return this.checkers.has(provider);
  }
}

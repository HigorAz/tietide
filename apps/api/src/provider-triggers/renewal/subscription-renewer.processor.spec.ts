import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivationService } from '../activation.service';
import { SubscriptionRenewerProcessor } from './subscription-renewer.processor';

interface PrismaMock {
  providerSubscription: { findMany: jest.Mock };
}
interface ActivationMock {
  renewSubscription: jest.Mock;
}

describe('SubscriptionRenewerProcessor', () => {
  let processor: SubscriptionRenewerProcessor;
  let prisma: PrismaMock;
  let activation: ActivationMock;

  const fixedNow = new Date('2026-05-08T12:00:00Z').valueOf();

  beforeEach(async () => {
    prisma = {
      providerSubscription: { findMany: jest.fn(async () => []) },
    };
    activation = { renewSubscription: jest.fn(async () => undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionRenewerProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivationService, useValue: activation },
      ],
    }).compile();

    processor = mod.get(SubscriptionRenewerProcessor);
    jest.useFakeTimers().setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('selects subscriptions expiring within 24h and renews each one', async () => {
    const expiringSoon = [
      { id: 'sub-1', workflowId: 'wf-1', expiresAt: new Date(fixedNow + 1000 * 60 * 60) },
      { id: 'sub-2', workflowId: 'wf-2', expiresAt: new Date(fixedNow + 1000 * 60 * 60 * 12) },
    ];
    prisma.providerSubscription.findMany.mockResolvedValueOnce(expiringSoon);

    await processor.process({ data: {} } as never);

    expect(prisma.providerSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
    expect(activation.renewSubscription).toHaveBeenCalledTimes(2);
    expect(activation.renewSubscription).toHaveBeenCalledWith('sub-1');
    expect(activation.renewSubscription).toHaveBeenCalledWith('sub-2');
  });

  it('continues processing remaining subscriptions when one renewal fails', async () => {
    prisma.providerSubscription.findMany.mockResolvedValueOnce([
      { id: 'sub-1', workflowId: 'wf-1', expiresAt: new Date(fixedNow + 1000) },
      { id: 'sub-2', workflowId: 'wf-2', expiresAt: new Date(fixedNow + 2000) },
    ]);
    activation.renewSubscription
      .mockRejectedValueOnce(new Error('Stripe down'))
      .mockResolvedValueOnce(undefined);

    await processor.process({ data: {} } as never);

    expect(activation.renewSubscription).toHaveBeenCalledTimes(2);
    expect(activation.renewSubscription).toHaveBeenCalledWith('sub-2');
  });

  it('is a no-op when no subscriptions are due for renewal', async () => {
    prisma.providerSubscription.findMany.mockResolvedValueOnce([]);
    await processor.process({ data: {} } as never);
    expect(activation.renewSubscription).not.toHaveBeenCalled();
  });

  it('renews a Drive watch channel that expires within the 24h lookahead window', async () => {
    // Drive channels are created with 6.5d lifetime; the renewer fires hourly
    // and picks up a row when expiresAt <= now+24h. Six days after activation,
    // expiresAt is now + 12h — well within the window.
    prisma.providerSubscription.findMany.mockResolvedValueOnce([
      {
        id: 'drive-sub-1',
        workflowId: 'wf-drive',
        provider: 'google',
        expiresAt: new Date(fixedNow + 1000 * 60 * 60 * 12),
      },
    ]);

    await processor.process({ data: {} } as never);

    expect(activation.renewSubscription).toHaveBeenCalledWith('drive-sub-1');
  });

  it('renews a Gmail Pub/Sub watch that expires within the 24h lookahead window', async () => {
    prisma.providerSubscription.findMany.mockResolvedValueOnce([
      {
        id: 'gmail-sub-1',
        workflowId: 'wf-gmail',
        provider: 'google',
        expiresAt: new Date(fixedNow + 1000 * 60 * 60 * 6),
      },
    ]);

    await processor.process({ data: {} } as never);

    expect(activation.renewSubscription).toHaveBeenCalledWith('gmail-sub-1');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/billing', () => ({
  getBilling: vi.fn(),
  startCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
}));

import * as billingApi from '@/api/billing';
import type { BillingSummary } from '@/api/billing';
import { useBillingStore, initialBillingState } from '@/stores/billingStore';
import { BillingSection } from './BillingSection';

const summary = (overrides: Partial<BillingSummary> = {}): BillingSummary => ({
  plan: 'FREE',
  status: 'ACTIVE',
  seats: { used: 1, included: 2, max: 2 },
  runs: { used: 10, included: 1000, hardCap: 1000 },
  workflows: { used: 1, max: 10 },
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  configured: true,
  ...overrides,
});

describe('BillingSection', () => {
  beforeEach(() => {
    useBillingStore.setState({ ...initialBillingState });
    vi.mocked(billingApi.getBilling).mockReset();
    vi.mocked(billingApi.startCheckout).mockReset();
    vi.mocked(billingApi.openBillingPortal).mockReset();
  });

  it('shows the plan and an Upgrade action on FREE, and starts checkout', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue(summary());
    vi.mocked(billingApi.startCheckout).mockResolvedValue('https://checkout');
    const user = userEvent.setup();

    render(<BillingSection />);

    await waitFor(() => expect(screen.getByText('Free')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /upgrade to pro/i }));
    expect(billingApi.startCheckout).toHaveBeenCalledWith('PRO');
  });

  it('shows Manage billing on a paid plan and opens the portal', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue(summary({ plan: 'PRO' }));
    vi.mocked(billingApi.openBillingPortal).mockResolvedValue('https://portal');
    const user = userEvent.setup();

    render(<BillingSection />);

    await waitFor(() => expect(screen.getByText('Pro')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /manage billing/i }));
    expect(billingApi.openBillingPortal).toHaveBeenCalled();
  });

  it('hides upgrade/manage actions when billing is not configured', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue(summary({ configured: false }));

    render(<BillingSection />);

    await waitFor(() => expect(screen.getByText(/billing is not enabled/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /upgrade to pro/i })).not.toBeInTheDocument();
  });

  it('surfaces a past-due warning', async () => {
    vi.mocked(billingApi.getBilling).mockResolvedValue(
      summary({ plan: 'PRO', status: 'PAST_DUE' }),
    );

    render(<BillingSection />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/past due/i));
  });
});

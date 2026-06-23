import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionCard } from './ConnectionCard';

describe('ConnectionCard', () => {
  it('renders provider icon, name, a status line and is the (clickable) trigger row', () => {
    render(
      <ConnectionCard
        providerIcon={<span data-testid="provider-icon" />}
        name="My Google"
        status="ACTIVE"
        optional={false}
        stale={false}
      />,
    );

    expect(screen.getByTestId('provider-icon')).toBeInTheDocument();
    expect(screen.getByText('My Google')).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    // The whole card is the trigger button (no separate "change" affordance).
    expect(screen.getByTestId('connection-card-change').tagName).toBe('BUTTON');
  });

  it('opens the picker directly when the card row is clicked (forwards onClick)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ConnectionCard
        providerIcon={<span />}
        name="My Google"
        status="ACTIVE"
        optional={false}
        stale={false}
        onClick={onClick}
      />,
    );

    await user.click(screen.getByTestId('connection-card-change'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a muted "No authentication" state for an optional connection with no selection', () => {
    render(
      <ConnectionCard providerIcon={<span />} name={null} status={null} optional stale={false} />,
    );

    expect(screen.getByText(/no authentication/i)).toBeInTheDocument();
  });

  it('renders "Choose a connection" for a required connection with no selection', () => {
    render(
      <ConnectionCard
        providerIcon={<span />}
        name={null}
        status={null}
        optional={false}
        stale={false}
      />,
    );

    expect(screen.getByText(/choose a connection/i)).toBeInTheDocument();
  });

  it('renders "Connection unavailable" when the saved connection is stale', () => {
    render(
      <ConnectionCard providerIcon={<span />} name={null} status={null} optional={false} stale />,
    );

    expect(screen.getByText(/connection unavailable/i)).toBeInTheDocument();
  });

  it('forwards a ref to the underlying button (so Radix Select.Trigger asChild works)', () => {
    const ref = vi.fn();
    render(
      <ConnectionCard
        ref={ref}
        providerIcon={<span />}
        name="My Google"
        status="ACTIVE"
        optional={false}
        stale={false}
      />,
    );

    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });
});

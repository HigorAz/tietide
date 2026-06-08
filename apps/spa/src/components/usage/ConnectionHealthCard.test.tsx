import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ConnectionHealth } from '@/api/usage';
import { ConnectionHealthCard } from './ConnectionHealthCard';

const items: ConnectionHealth[] = [
  { status: 'ACTIVE', count: 3 },
  { status: 'EXPIRED', count: 0 },
  { status: 'ERROR', count: 1 },
  { status: 'REVOKED', count: 0 },
];

const renderCard = (rows: ConnectionHealth[]): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <ConnectionHealthCard items={rows} />
    </MemoryRouter>,
  );

describe('ConnectionHealthCard', () => {
  it('renders a count per status and a link to the connections page', () => {
    renderCard(items);

    const active = screen.getByText('ACTIVE').closest('li');
    expect(within(active as HTMLElement).getByText('3')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /view connections/i });
    expect(link).toHaveAttribute('href', '/connections');
  });

  it('shows an empty state when there are no connections', () => {
    renderCard([
      { status: 'ACTIVE', count: 0 },
      { status: 'EXPIRED', count: 0 },
      { status: 'ERROR', count: 0 },
      { status: 'REVOKED', count: 0 },
    ]);

    expect(screen.getByText(/no connections configured/i)).toBeInTheDocument();
  });
});

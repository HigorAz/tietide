import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { RecentFailure } from '@/api/usage';
import { RecentFailuresList } from './RecentFailuresList';

const items: RecentFailure[] = [
  {
    id: 'ex-1',
    workflowId: 'wf-a',
    workflowName: 'Alpha sync',
    error: 'connection refused',
    finishedAt: '2026-05-04T10:00:05.000Z',
    createdAt: '2026-05-04T10:00:00.000Z',
  },
];

const renderList = (rows: RecentFailure[]): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <RecentFailuresList items={rows} />
    </MemoryRouter>,
  );

describe('RecentFailuresList', () => {
  it('renders each failure with workflow name and a link to the execution detail', () => {
    renderList(items);

    const link = screen.getByRole('link', { name: /alpha sync/i });
    expect(link).toHaveAttribute('href', '/executions/ex-1');
    expect(screen.getByText('connection refused')).toBeInTheDocument();
  });

  it('shows an empty state when there are no failures', () => {
    renderList([]);

    expect(screen.getByText(/no failures in this window/i)).toBeInTheDocument();
  });
});

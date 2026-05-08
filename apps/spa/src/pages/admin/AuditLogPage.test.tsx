import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditLogListResponse, AuditLogRow } from '@/api/auditLog';
import { AuditLogPage } from './AuditLogPage';

vi.mock('@/api/auditLog', () => ({
  listAuditLog: vi.fn(),
  listAuditLogFilters: vi.fn(),
  exportAuditLogCsv: vi.fn(),
}));

import { listAuditLog, listAuditLogFilters, exportAuditLogCsv } from '@/api/auditLog';

const listAuditLogMock = vi.mocked(listAuditLog);
const listAuditLogFiltersMock = vi.mocked(listAuditLogFilters);
const exportAuditLogCsvMock = vi.mocked(exportAuditLogCsv);

const sampleRow = (overrides: Partial<AuditLogRow> = {}): AuditLogRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'admin-uuid',
  userEmail: 'admin@example.com',
  action: 'env-var.create',
  resource: 'env-var',
  resourceId: 'ev-1',
  metadata: { key: 'API_BASE_URL' },
  createdAt: '2026-05-08T12:00:00.000Z',
  ...overrides,
});

const sampleResponse = (
  rows: AuditLogRow[],
  nextCursor: string | null = null,
): AuditLogListResponse => ({ items: rows, nextCursor });

describe('AuditLogPage', () => {
  beforeEach(() => {
    listAuditLogMock.mockReset();
    listAuditLogFiltersMock.mockReset();
    exportAuditLogCsvMock.mockReset();
    listAuditLogFiltersMock.mockResolvedValue({
      users: [
        { id: 'admin-uuid', email: 'admin@example.com' },
        { id: 'user-uuid', email: 'user@example.com' },
      ],
      actions: ['env-var.create', 'env-var.delete', 'workflow.create'],
      resources: ['env-var', 'workflow'],
    });
  });

  it('should render rows returned by the list API', async () => {
    listAuditLogMock.mockResolvedValue(
      sampleResponse([
        sampleRow({ id: 'a', action: 'env-var.create' }),
        sampleRow({ id: 'b', action: 'workflow.create', resource: 'workflow' }),
      ]),
    );

    render(<AuditLogPage />);

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // header + 2 data rows
    expect(rows).toHaveLength(3);
    expect(within(table).getAllByText('admin@example.com').length).toBeGreaterThan(0);
    expect(within(table).getByText('env-var.create')).toBeInTheDocument();
    expect(within(table).getByText('workflow.create')).toBeInTheDocument();
  });

  it('should render an empty state when no rows are returned', async () => {
    listAuditLogMock.mockResolvedValue(sampleResponse([]));

    render(<AuditLogPage />);

    expect(await screen.findByText(/no audit log entries/i)).toBeInTheDocument();
  });

  it('should refetch with the action filter when the action dropdown changes', async () => {
    listAuditLogMock.mockResolvedValue(sampleResponse([]));

    render(<AuditLogPage />);

    await screen.findByText(/no audit log entries/i);
    listAuditLogMock.mockClear();

    const select = await screen.findByLabelText(/^action$/i);
    await userEvent.selectOptions(select, 'env-var.create');

    await waitFor(() =>
      expect(listAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'env-var.create' }),
      ),
    );
  });

  it('should pass the cursor when Load more is clicked', async () => {
    listAuditLogMock.mockResolvedValueOnce(
      sampleResponse([sampleRow({ id: 'a' })], 'CURSOR_NEXT_TOKEN'),
    );
    listAuditLogMock.mockResolvedValueOnce(sampleResponse([sampleRow({ id: 'b' })]));

    render(<AuditLogPage />);

    const loadMore = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(loadMore);

    await waitFor(() =>
      expect(listAuditLogMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'CURSOR_NEXT_TOKEN' }),
      ),
    );
  });

  it('should call exportAuditLogCsv with the current filter set when Export CSV is clicked', async () => {
    listAuditLogMock.mockResolvedValue(sampleResponse([]));
    exportAuditLogCsvMock.mockResolvedValue(new Blob(['id\n'], { type: 'text/csv' }));

    render(<AuditLogPage />);

    await screen.findByText(/no audit log entries/i);

    const select = await screen.findByLabelText(/^action$/i);
    await userEvent.selectOptions(select, 'env-var.delete');

    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() =>
      expect(exportAuditLogCsvMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'env-var.delete' }),
      ),
    );
  });

  it('should toggle metadata expand/collapse when the row toggle is clicked', async () => {
    listAuditLogMock.mockResolvedValue(
      sampleResponse([sampleRow({ id: 'a', metadata: { key: 'API_BASE_URL', extra: 'value' } })]),
    );

    render(<AuditLogPage />);

    const expandButton = await screen.findByRole('button', { name: /expand metadata/i });
    expect(screen.queryByTestId('metadata-json-a')).toBeNull();

    await userEvent.click(expandButton);

    expect(await screen.findByTestId('metadata-json-a')).toBeInTheDocument();
    expect(screen.getByTestId('metadata-json-a').textContent).toContain('API_BASE_URL');

    await userEvent.click(screen.getByRole('button', { name: /collapse metadata/i }));
    await waitFor(() => expect(screen.queryByTestId('metadata-json-a')).toBeNull());
  });

  it('should populate the user dropdown from the filters API', async () => {
    listAuditLogMock.mockResolvedValue(sampleResponse([]));

    render(<AuditLogPage />);

    const userSelect = await screen.findByLabelText(/^user$/i);
    expect(within(userSelect).getByText('admin@example.com')).toBeInTheDocument();
    expect(within(userSelect).getByText('user@example.com')).toBeInTheDocument();
  });
});

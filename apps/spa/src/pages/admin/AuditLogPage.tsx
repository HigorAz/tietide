import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  exportAuditLogCsv,
  listAuditLog,
  listAuditLogFilters,
  type AuditLogFiltersResponse,
  type AuditLogQuery,
  type AuditLogRow,
} from '@/api/auditLog';

interface FilterState {
  userId: string;
  action: string;
  resource: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: FilterState = {
  userId: '',
  action: '',
  resource: '',
  from: '',
  to: '',
};

function buildQuery(filters: FilterState): AuditLogQuery {
  const out: AuditLogQuery = {};
  if (filters.userId) out.userId = filters.userId;
  if (filters.action) out.action = filters.action;
  if (filters.resource) out.resource = filters.resource;
  if (filters.from) out.from = new Date(`${filters.from}T00:00:00.000Z`).toISOString();
  if (filters.to) out.to = new Date(`${filters.to}T23:59:59.999Z`).toISOString();
  return out;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function truncate(value: string, max = 32): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function metadataPreview(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '—';
  try {
    return truncate(JSON.stringify(metadata), 60);
  } catch {
    return '—';
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AuditLogPage(): JSX.Element {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<AuditLogFiltersResponse>({
    users: [],
    actions: [],
    resources: [],
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const queryFromFilters = useMemo(() => buildQuery(filters), [filters]);

  const fetchPage = useCallback(
    async (query: AuditLogQuery, mode: 'replace' | 'append'): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const response = await listAuditLog(query);
        setRows((prev) => (mode === 'append' ? [...prev, ...response.items] : response.items));
        setNextCursor(response.nextCursor);
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } }; message?: string }).response?.data
            ?.message ??
          (err as Error).message ??
          'Failed to load audit log';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      try {
        const f = await listAuditLogFilters();
        setFilterValues(f);
      } catch {
        // Filter dropdowns are best-effort — table will still load.
      }
    })();
  }, []);

  useEffect(() => {
    void fetchPage(queryFromFilters, 'replace');
  }, [fetchPage, queryFromFilters]);

  const handleSelect = (key: keyof FilterState) => (event: ChangeEvent<HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };
  const handleDate = (key: 'from' | 'to') => (event: ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleReset = (): void => setFilters(EMPTY_FILTERS);

  const handleLoadMore = async (): Promise<void> => {
    if (!nextCursor) return;
    await fetchPage({ ...queryFromFilters, cursor: nextCursor }, 'append');
  };

  const handleExport = async (): Promise<void> => {
    setExportError(null);
    try {
      const blob = await exportAuditLogCsv(queryFromFilters);
      const filename = `audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
      triggerBlobDownload(blob, filename);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string }).response?.data
          ?.message ??
        (err as Error).message ??
        'Failed to export';
      setExportError(message);
    }
  };

  const toggleExpand = (id: string): void => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isEmpty = !loading && rows.length === 0 && !error;

  return (
    <div className="flex flex-col">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto w-full max-w-6xl px-6 py-4">
          <h1 className="text-lg font-semibold">Admin · Audit log</h1>
          <p className="text-xs text-text-secondary">
            Every recorded action across the platform. Filter by user, action, resource, or date.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
        <section
          aria-label="Filters"
          className="flex flex-wrap items-end gap-4 rounded-lg border border-white/5 bg-surface p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>User</span>
            <select
              aria-label="User"
              value={filters.userId}
              onChange={handleSelect('userId')}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            >
              <option value="">All users</option>
              {filterValues.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Action</span>
            <select
              aria-label="Action"
              value={filters.action}
              onChange={handleSelect('action')}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            >
              <option value="">All actions</option>
              {filterValues.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Resource</span>
            <select
              aria-label="Resource"
              value={filters.resource}
              onChange={handleSelect('resource')}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            >
              <option value="">All resources</option>
              {filterValues.resources.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>From</span>
            <input
              type="date"
              value={filters.from}
              onChange={handleDate('from')}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>To</span>
            <input
              type="date"
              value={filters.to}
              onChange={handleDate('to')}
              className="rounded border border-white/10 bg-deep-blue px-2 py-1 text-sm text-text-primary focus:border-accent-teal focus:outline-none"
            />
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-white/10 bg-surface px-3 py-1 text-sm text-text-primary transition hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              className="rounded-md bg-accent-teal px-3 py-1 text-sm font-medium text-deep-blue transition hover:bg-accent-teal/80 focus:outline-none focus:ring-1 focus:ring-accent-teal"
            >
              Export CSV
            </button>
          </div>
        </section>

        {exportError && (
          <div
            role="alert"
            className="rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            {exportError}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error"
          >
            {error}
          </div>
        )}

        {loading && rows.length === 0 && (
          <p className="text-sm text-text-secondary">Loading audit log…</p>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/10 bg-surface/40 p-12 text-center">
            <h2 className="text-base font-semibold text-text-primary">
              No audit log entries match your filters
            </h2>
            <p className="max-w-sm text-sm text-text-secondary">
              Try widening the date range or clearing filters to see more activity.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-white/5 bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-deep-blue/40 text-left text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-semibold">Timestamp</th>
                  <th className="px-4 py-2 font-semibold">User</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                  <th className="px-4 py-2 font-semibold">Resource</th>
                  <th className="px-4 py-2 font-semibold">Resource ID</th>
                  <th className="px-4 py-2 font-semibold">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOpen = expanded[row.id] === true;
                  return (
                    <tr key={row.id} className="border-t border-white/5 align-top">
                      <td className="px-4 py-3 text-text-secondary">
                        {formatTimestamp(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-text-primary">{row.userEmail ?? row.userId}</td>
                      <td className="px-4 py-3">{row.action}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.resource}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.resourceId ? truncate(row.resourceId, 16) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.metadata ? (
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => toggleExpand(row.id)}
                              aria-label={
                                isOpen
                                  ? `Collapse metadata for ${row.id}`
                                  : `Expand metadata for ${row.id}`
                              }
                              className="text-left text-xs text-accent-teal hover:underline focus:outline-none focus:ring-1 focus:ring-accent-teal"
                            >
                              {isOpen ? 'Collapse' : metadataPreview(row.metadata)}
                            </button>
                            {isOpen && (
                              <pre
                                data-testid={`metadata-json-${row.id}`}
                                className="mt-1 max-h-40 overflow-auto rounded bg-deep-blue/40 p-2 text-[11px] text-text-primary"
                              >
                                {JSON.stringify(row.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nextCursor && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              disabled={loading}
              className="rounded-md border border-white/10 bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default AuditLogPage;

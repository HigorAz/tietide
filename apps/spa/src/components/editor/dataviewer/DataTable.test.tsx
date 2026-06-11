import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable, extractRows } from './DataTable';

describe('extractRows', () => {
  it('returns an array of plain objects directly', () => {
    const rows = extractRows([{ id: 'a' }, { id: 'b', extra: 1 }]);
    expect(rows).toEqual([{ id: 'a' }, { id: 'b', extra: 1 }]);
  });

  it('drills into the first array-valued key (Gmail demo shape)', () => {
    const rows = extractRows({ messages: [{ id: 'a' }], resultSizeEstimate: 10 });
    expect(rows).toEqual([{ id: 'a' }]);
  });

  it('returns null for arrays of scalars', () => {
    expect(extractRows([1, 2, 3])).toBeNull();
  });

  it('returns null for strings, plain objects without array keys, and empty arrays', () => {
    expect(extractRows('str')).toBeNull();
    expect(extractRows({ a: 1 })).toBeNull();
    expect(extractRows([])).toBeNull();
  });
});

describe('DataTable', () => {
  it('renders the Gmail demo shape as a table with an id column', () => {
    const demo = {
      messages: [
        { id: 'a', threadId: 't1' },
        { id: 'b', threadId: 't2' },
      ],
      resultSizeEstimate: 10,
    };
    render(<DataTable value={demo} />);
    expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'threadId' })).toBeInTheDocument();
    // first data row shows index 0 and the first id
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows.length).toBe(3);
    expect(within(rows[1]).getByText('0')).toBeInTheDocument();
  });

  it('builds union-of-keys columns and shows a muted dash for missing cells', () => {
    render(<DataTable value={[{ id: 'a' }, { id: 'b', extra: 1 }]} testId="dt" />);
    expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'extra' })).toBeInTheDocument();
    // row 0 has no `extra` → renders the em dash
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the fallback note for non-tabular data', () => {
    render(<DataTable value={{ a: 1 }} />);
    expect(screen.getByTestId('data-table-fallback')).toHaveTextContent(
      "This data isn't tabular — switch to Tree or Raw.",
    );
  });
});

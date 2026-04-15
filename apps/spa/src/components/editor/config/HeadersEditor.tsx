import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface HeadersEditorProps {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

interface Row {
  id: number;
  key: string;
  value: string;
}

const recordToRows = (record: Record<string, string>): Row[] => {
  const entries = Object.entries(record);
  if (entries.length === 0) return [{ id: 0, key: '', value: '' }];
  return entries.map(([key, value], index) => ({ id: index, key, value }));
};

const rowsToRecord = (rows: Row[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.key === '') continue;
    out[row.key] = row.value;
  }
  return out;
};

export function HeadersEditor({ value, onChange }: HeadersEditorProps) {
  const [rows, setRows] = useState<Row[]>(() => recordToRows(value));
  const [nextId, setNextId] = useState(() => rows.length);

  const emit = (next: Row[]) => {
    setRows(next);
    onChange(rowsToRecord(next));
  };

  const handleKeyChange = (id: number, key: string) => {
    emit(rows.map((r) => (r.id === id ? { ...r, key } : r)));
  };

  const handleValueChange = (id: number, value: string) => {
    emit(rows.map((r) => (r.id === id ? { ...r, value } : r)));
  };

  const handleAdd = () => {
    setRows([...rows, { id: nextId, key: '', value: '' }]);
    setNextId(nextId + 1);
  };

  const handleRemove = (id: number) => {
    const next = rows.filter((r) => r.id !== id);
    emit(next.length === 0 ? [{ id: nextId, key: '', value: '' }] : next);
    if (next.length === 0) setNextId(nextId + 1);
  };

  const inputClass = cn(
    'min-w-0 rounded-md border border-white/5 bg-elevated px-2 py-1.5',
    'text-xs text-text-primary placeholder:text-text-muted',
    'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
  );

  return (
    <div data-testid="headers-editor" className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Key"
            value={row.key}
            onChange={(e) => handleKeyChange(row.id, e.target.value)}
            className={cn(inputClass, 'flex-1')}
          />
          <input
            type="text"
            placeholder="Value"
            value={row.value}
            onChange={(e) => handleValueChange(row.id, e.target.value)}
            className={cn(inputClass, 'flex-1')}
          />
          <button
            type="button"
            aria-label="Remove header"
            onClick={() => handleRemove(row.id)}
            className={cn(
              'shrink-0 rounded-md p-1 text-text-muted transition',
              'hover:bg-elevated hover:text-red-400',
              'focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        className={cn(
          'mt-1 flex items-center gap-1 self-start rounded-md px-2 py-1',
          'text-xs text-accent-teal hover:bg-elevated',
          'focus:outline-none focus:ring-1 focus:ring-accent-teal',
        )}
      >
        <Plus size={12} strokeWidth={2} aria-hidden />
        Add header
      </button>
    </div>
  );
}

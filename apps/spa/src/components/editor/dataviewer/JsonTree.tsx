import { ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';
import {
  branchBadge,
  buildPillPath,
  childPath,
  classifyValue,
  flattenLeaves,
  formatScalar,
  matchesSearch,
  type ValueKind,
} from './valueFormat';
import { useCopy, type CopyFn } from './useCopy';

const VALUE_CLASS: Record<ValueKind, string> = {
  string: 'text-data-string',
  number: 'text-data-number',
  boolean: 'text-data-boolean',
  null: 'text-data-null italic',
  array: 'text-data-key',
  object: 'text-data-key',
};

interface JsonTreeProps {
  value: unknown;
  /** Stable alias root (`trigger` / `steps.<alias>`); enables the "Copy path" button. */
  pillRef?: string;
  /** When non-empty, flatten matching leaves into `path: value` rows. */
  searchQuery?: string;
  testId?: string;
}

interface RowProps {
  name: string;
  value: unknown;
  path: string;
  depth: number;
  pillRef?: string;
  copy: CopyFn;
}

/** Hover-revealed copy buttons. `e.stopPropagation()` so they never toggle the row. */
function CopyActions({
  value,
  path,
  pillRef,
  copy,
}: {
  value: unknown;
  path: string;
  pillRef?: string;
  copy: CopyFn;
}): JSX.Element {
  const actionClass =
    'rounded px-1 py-0.5 text-[10px] text-text-secondary opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/10 hover:text-accent-teal';
  const copyValue = (e: React.MouseEvent): void => {
    e.stopPropagation();
    const kind = classifyValue(value);
    const text =
      kind === 'string'
        ? (value as string)
        : kind === 'array' || kind === 'object'
          ? JSON.stringify(value, null, 2)
          : formatScalar(value);
    void copy(text, 'value');
  };
  const copyPath = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (pillRef === undefined) return;
    void copy(buildPillPath(pillRef, path), 'path');
  };
  return (
    <span className="ml-auto flex items-center gap-0.5">
      <button type="button" aria-label="Copy value" className={actionClass} onClick={copyValue}>
        value
      </button>
      {pillRef !== undefined && (
        <button type="button" aria-label="Copy path" className={actionClass} onClick={copyPath}>
          path
        </button>
      )}
    </span>
  );
}

const ROW_CLASS = 'group flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/5';

const TreeRow = memo(function TreeRow({
  name,
  value,
  path,
  depth,
  pillRef,
  copy,
}: RowProps): JSX.Element {
  const [open, setOpen] = useState(depth === 0);
  const kind = classifyValue(value);
  const isBranch = kind === 'array' || kind === 'object';
  const badge = branchBadge(value);
  const indent = { paddingLeft: depth * 14 };

  if (!isBranch) {
    return (
      <div className={ROW_CLASS} style={indent} data-testid="json-row">
        <span className="w-3 shrink-0" />
        <span className="text-data-key">{name}</span>
        <span className="text-text-muted">:</span>
        <span className={VALUE_CLASS[kind]}>{formatScalar(value)}</span>
        <CopyActions value={value} path={path} pillRef={pillRef} copy={copy} />
      </div>
    );
  }

  const entries: Array<[string, unknown, string | number]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v, i])
    : Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v, k]);

  return (
    <div>
      <div
        className={`${ROW_CLASS} cursor-pointer`}
        style={indent}
        data-testid="json-row"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-data-key">{name}</span>
        {badge !== null && <span className="text-[10px] text-text-muted">{badge}</span>}
        <CopyActions value={value} path={path} pillRef={pillRef} copy={copy} />
      </div>
      {open &&
        entries.map(([childName, childValue, key]) => (
          <TreeRow
            key={path + '/' + childName}
            name={childName}
            value={childValue}
            path={childPath(path, key)}
            depth={depth + 1}
            pillRef={pillRef}
            copy={copy}
          />
        ))}
    </div>
  );
});

/** Collapsible JSON tree with hover copy actions + a flat search mode. */
export function JsonTree({ value, pillRef, searchQuery, testId }: JsonTreeProps): JSX.Element {
  const copy = useCopy();
  const query = (searchQuery ?? '').trim();

  if (query.length > 0) {
    const rows = flattenLeaves(value).filter((leaf) => matchesSearch(leaf, query));
    return (
      <div className="font-mono text-[11.5px]" data-testid={testId ?? 'json-tree'}>
        {rows.length === 0 ? (
          <div className="px-1.5 py-1 text-text-muted">No matching fields</div>
        ) : (
          rows.map((leaf) => (
            <div key={leaf.path} className={ROW_CLASS} data-testid="json-row">
              <span className="text-data-key">{leaf.path}</span>
              <span className="text-text-muted">:</span>
              <span className={VALUE_CLASS[classifyValue(leaf.value)]}>
                {formatScalar(leaf.value)}
              </span>
              <CopyActions value={leaf.value} path={leaf.path} pillRef={pillRef} copy={copy} />
            </div>
          ))
        )}
      </div>
    );
  }

  // Top-level entries render directly as depth-0 rows (first level expanded by
  // default per the locked design). A scalar/null root collapses to one leaf row.
  const kind = classifyValue(value);
  const rootEntries: Array<[string, unknown, string | number]> | null =
    kind === 'array'
      ? (value as unknown[]).map((v, i) => [String(i), v, i])
      : kind === 'object'
        ? Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v, k])
        : null;

  return (
    <div className="font-mono text-[11.5px]" data-testid={testId ?? 'json-tree'}>
      {rootEntries === null ? (
        <TreeRow name="" value={value} path="" depth={0} pillRef={pillRef} copy={copy} />
      ) : (
        rootEntries.map(([name, childValue, key]) => (
          <TreeRow
            key={String(key)}
            name={name}
            value={childValue}
            path={childPath('', key)}
            depth={0}
            pillRef={pillRef}
            copy={copy}
          />
        ))
      )}
    </div>
  );
}

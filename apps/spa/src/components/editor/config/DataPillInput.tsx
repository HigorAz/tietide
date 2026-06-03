import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SyntheticEvent,
  type UIEvent as ReactUIEvent,
} from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { TemplateOperator } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import { getUpstreamSchemas, type PathSuggestion } from '@/lib/upstream-schema';
import {
  appendOperatorAtCaret,
  buildPillToken,
  findClosedTokenBeforeCaret,
  findOpenTokenStart,
  insertToken,
  splitSegments,
  type ClosedTokenSpan,
} from '@/lib/dataPillToken';
import { humanizePath } from '@/lib/humanize-path';
import { AppendOperatorMenu } from './AppendOperatorMenu';
import { PillOverlay } from './PillOverlay';

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

export interface DataPillInputProps {
  value: string;
  onChange: (next: string) => void;
  nodeId: string;
  placeholder?: string;
  className?: string;
  id?: string;
  type?: 'text' | 'url';
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function DataPillInput({
  value,
  onChange,
  nodeId,
  placeholder,
  className,
  id,
  type,
  ...rest
}: DataPillInputProps) {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const setActivePillField = useEditorStore((s) => s.setActivePillField);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filterText, setFilterText] = useState('');
  // Expandable field: collapsed = single-line <input>, expanded = multi-line
  // <textarea>. Both share the same caret/value handlers (selectionStart works
  // on either), so autocomplete and the pill inserter behave identically.
  const [expanded, setExpanded] = useState(false);
  // #258: when the caret sits right after a closed pill, offer an "append operator" menu.
  const [appendSpan, setAppendSpan] = useState<ClosedTokenSpan | null>(null);

  const inputRef = useRef<FieldElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Live refs so the stable insert callback registered with the store always
  // reads the current value/onChange without re-registering on every keystroke.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const upstream = useMemo(() => getUpstreamSchemas(nodeId, nodes, edges), [nodeId, nodes, edges]);

  const suggestions = useMemo<PathSuggestion[]>(() => {
    const filter = filterText.toLowerCase();
    if (filter.length === 0) return upstream.suggestions;
    return upstream.suggestions.filter((s) => {
      const haystack = `${s.ref}.${s.path} ${s.nodeLabel} ${humanizePath(s.path)}`.toLowerCase();
      return haystack.includes(filter);
    });
  }, [upstream.suggestions, filterText]);

  const segments = useMemo(() => splitSegments(value), [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= suggestions.length) setActiveIndex(0);
  }, [suggestions.length, activeIndex]);

  const refreshAutocomplete = (input: FieldElement) => {
    const caret = input.selectionStart ?? input.value.length;
    setAppendSpan(findClosedTokenBeforeCaret(input.value, caret));
    const tokenStart = findOpenTokenStart(input.value, caret);
    if (tokenStart === null) {
      setOpen(false);
      return;
    }
    const partial = input.value.slice(tokenStart + 2, caret);
    if (/\s/.test(partial)) {
      setOpen(false);
      return;
    }
    setFilterText(partial);
    setActiveIndex(0);
    setOpen(true);
  };

  const handleChange = (e: ChangeEvent<FieldElement>) => {
    onChange(e.target.value);
    refreshAutocomplete(e.target);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<FieldElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const picked = suggestions[activeIndex];
      if (picked) {
        e.preventDefault();
        insertSuggestion(picked);
      }
    }
  };

  // Re-focus the input and place the caret after a programmatic value change.
  const focusAtCaret = (caret: number) => {
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const insertSuggestion = (suggestion: PathSuggestion) => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? value.length;
    const token = buildPillToken(suggestion.ref, suggestion.path);
    const { value: newValue, caret: newCaret } = insertToken(value, token, caret);
    onChange(newValue);
    setOpen(false);
    focusAtCaret(newCaret);
  };

  // #258: append a chained operator to the closed pill immediately before the caret.
  const applyAppendOperator = (op: TemplateOperator) => {
    if (!appendSpan) return;
    const { value: newValue, caret: newCaret } = appendOperatorAtCaret(value, appendSpan.end, op);
    onChange(newValue);
    setAppendSpan(null);
    focusAtCaret(newCaret);
  };

  // Stable insert callback registered with the store on focus. The standalone
  // DataPillPicker invokes it to insert a token at the live caret position.
  // Reads value/onChange through refs so its identity never changes.
  const insertAtCaret = useCallback((token: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? valueRef.current.length;
    const { value: newValue, caret: newCaret } = insertToken(valueRef.current, token, caret);
    onChangeRef.current(newValue);
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(newCaret, newCaret);
    }, 0);
  }, []);

  const handleOptionMouseDown = (e: ReactMouseEvent<HTMLLIElement>, suggestion: PathSuggestion) => {
    e.preventDefault();
    insertSuggestion(suggestion);
  };

  // Keep the highlight overlay aligned with the field as it scrolls (horizontally
  // when collapsed, vertically when expanded past its rows).
  const syncScroll = (el: FieldElement): void => {
    const o = overlayRef.current;
    if (!o) return;
    o.scrollTop = el.scrollTop;
    o.scrollLeft = el.scrollLeft;
  };
  const refreshFromEvent = (e: SyntheticEvent<FieldElement>): void =>
    refreshAutocomplete(e.currentTarget);
  const onScroll = (e: ReactUIEvent<FieldElement>): void => syncScroll(e.currentTarget);

  const showPlaceholder = value.length === 0;

  const commonProps = {
    id,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onFocus: () => setActivePillField({ nodeId, insert: insertAtCaret }),
    onBlur: () => setActivePillField(null),
    onKeyUp: refreshFromEvent,
    onClick: refreshFromEvent,
    // onSelect tracks caret moves so the #258 append-operator affordance re-evaluates.
    onSelect: refreshFromEvent,
    onScroll,
    role: 'combobox' as const,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': open,
    'aria-controls': listboxId,
    'aria-activedescendant':
      open && suggestions[activeIndex] ? `${listboxId}-${activeIndex}` : undefined,
    autoComplete: 'off',
    spellCheck: false,
  };

  const fieldClass = cn(
    'relative w-full rounded-md border border-white/5 bg-elevated py-2 pl-3 pr-8 text-sm leading-6',
    'text-transparent caret-text-primary',
    'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <PillOverlay
        overlayRef={overlayRef}
        segments={segments}
        placeholder={placeholder}
        showPlaceholder={showPlaceholder}
        multiline={expanded}
      />

      <button
        type="button"
        tabIndex={-1}
        aria-label={expanded ? 'Collapse field' : 'Expand field'}
        data-testid="data-pill-expand-toggle"
        // preventDefault keeps the field from blurring (which would close the picker).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setExpanded((v) => !v)}
        className="absolute right-1.5 top-1.5 z-20 rounded p-0.5 text-text-muted hover:text-text-primary focus:outline-none"
      >
        {expanded ? <Minimize2 size={13} aria-hidden /> : <Maximize2 size={13} aria-hidden />}
      </button>

      {expanded ? (
        <textarea
          ref={inputRef as RefObject<HTMLTextAreaElement>}
          rows={6}
          {...commonProps}
          className={cn(fieldClass, 'resize-none')}
          {...rest}
        />
      ) : (
        <input
          ref={inputRef as RefObject<HTMLInputElement>}
          type={type ?? 'text'}
          {...commonProps}
          className={fieldClass}
          {...rest}
        />
      )}
      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          data-testid="data-pill-listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-white/10 bg-elevated shadow-lg"
        >
          {suggestions.slice(0, 25).map((s, i) => (
            <li
              key={`${s.nodeId}-${s.path}-${i}`}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                'cursor-pointer px-3 py-1.5 text-xs',
                i === activeIndex
                  ? 'bg-accent-teal/15 text-accent-teal'
                  : 'text-text-primary hover:bg-white/5',
              )}
              onMouseDown={(e) => handleOptionMouseDown(e, s)}
              onMouseEnter={() => setActiveIndex(i)}
              title={buildPillToken(s.ref, s.path)}
            >
              <span className="truncate">{humanizePath(s.path)}</span>
              <span className="ml-2 shrink-0 text-text-muted">
                {s.nodeLabel} · {s.type}
              </span>
            </li>
          ))}
        </ul>
      )}
      {appendSpan && <AppendOperatorMenu onAppend={applyAppendOperator} />}
    </div>
  );
}
